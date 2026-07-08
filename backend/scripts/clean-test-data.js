const path = require("path");
const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const CONFIRMATION = "ELIMINAR_DATOS_DE_PRUEBA";
const confirmationArg = process.argv.find((arg) => arg.startsWith("--confirmar="));
const confirmation = confirmationArg?.slice("--confirmar=".length) || "";

const PROCESS_TABLES = [
  "submission_feedback",
  "submission_logs",
  "submissions",
  "payments",
  "submission_counters",
  "payment_trace_counter"
];

async function tableExists(client, table) {
  const result = await client.query("SELECT to_regclass($1) AS name", [`public.${table}`]);
  return Boolean(result.rows[0]?.name);
}

async function getCounts(client, tables) {
  const counts = {};
  for (const table of tables) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM public.${table}`);
    counts[table] = Number(result.rows[0].count);
  }
  return counts;
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no esta configurado en backend/.env.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    const connection = await client.query(
      "SELECT current_database() AS database, COALESCE(inet_server_addr()::text, 'local') AS host, inet_server_port() AS port"
    );
    const existingTables = [];
    for (const table of PROCESS_TABLES) {
      if (await tableExists(client, table)) existingTables.push(table);
    }

    if (!existingTables.includes("submissions")) {
      throw new Error("No se encontro la tabla public.submissions. No se hizo ningun cambio.");
    }

    const before = await getCounts(client, existingTables);
    console.log("Base de datos seleccionada:", connection.rows[0]);
    console.table(before);

    if (confirmation !== CONFIRMATION) {
      console.log("\nVista previa solamente: no se elimino ningun dato.");
      console.log(`Para confirmar ejecute nuevamente con --confirmar=${CONFIRMATION}`);
      return;
    }

    await client.query("BEGIN");
    const usersBefore = await client.query("SELECT COUNT(*)::int AS count FROM public.users");
    const tableList = existingTables.map((table) => `public.${table}`).join(", ");
    await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY`);
    const usersAfter = await client.query("SELECT COUNT(*)::int AS count FROM public.users");

    if (usersBefore.rows[0].count !== usersAfter.rows[0].count) {
      throw new Error("Cambio inesperado en usuarios. Se cancelo la limpieza.");
    }

    await client.query("COMMIT");
    const after = await getCounts(client, existingTables);
    console.log("\nLimpieza completada. Los usuarios y la configuracion se conservaron.");
    console.table(after);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // No habia una transaccion activa.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
