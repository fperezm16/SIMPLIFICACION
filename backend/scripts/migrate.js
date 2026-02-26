const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const migrationsDir = path.resolve(__dirname, "..", "migrations");

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function readMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.toLowerCase().endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      checksum TEXT NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL no esta configurado.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const files = readMigrationFiles();
    if (!files.length) {
      console.log("No hay migraciones para ejecutar.");
      return;
    }

    let appliedCount = 0;

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, "utf8");
      const checksum = sha256(sql);

      const existing = await client.query(
        "SELECT checksum FROM schema_migrations WHERE filename = $1",
        [file]
      );

      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`La migracion ${file} cambio despues de ejecutarse.`);
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
          [file, checksum]
        );
        await client.query("COMMIT");
        appliedCount += 1;
        console.log(`OK ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Fallo la migracion ${file}: ${err.message}`);
      }
    }

    if (!appliedCount) {
      console.log("No hay migraciones pendientes.");
      return;
    }

    console.log(`Migraciones aplicadas: ${appliedCount}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
