require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
const PASSWORD = "Dvso@123";

const users = [
  {
    code: "d1r",
    name: "DVSO 1 - Recepción",
    email: "d1r@gmail.com",
    role: "recepcion_dvso"
  },
  {
    code: "d2aa",
    name: "DVSO 2 - Asistente de Aeronavegabilidad",
    email: "d2aa@gmail.com",
    role: "asistentes_aeronavegabilidad"
  },
  {
    code: "d3jsa",
    name: "DVSO 3 - Jefatura Sección Aeronavegabilidad",
    email: "d3jsa@gmail.com",
    role: "jefatura_seccion_aeronavegabilidad"
  },
  {
    code: "d4ia",
    name: "DVSO 4 - Inspector Aeronavegabilidad",
    email: "d4ia@gmail.com",
    role: "inspectores_aeronavegabilidad"
  },
  {
    code: "d5jso",
    name: "DVSO 5 - Jefatura Sección Operaciones",
    email: "d5jso@gmail.com",
    role: "jefatura_seccion_operaciones"
  },
  {
    code: "d6ir",
    name: "DVSO 6 - Inspector RPAS",
    email: "d6ir@gmail.com",
    role: "inspector_rpas"
  },
  {
    code: "d7jd",
    name: "DVSO 7 - Jefatura del DVSO",
    email: "d7jd@gmail.com",
    role: "jefatura_dvso"
  }
];

const oldEmails = [
  "d1r@dgac.gob.gt",
  "d2aa@dgac.gob.gt",
  "d3jsa@dgac.gob.gt",
  "d4ia@dgac.gob.gt",
  "d5jso@dgac.gob.gt",
  "d6ir@dgac.gob.gt",
  "d7jd@dgac.gob.gt"
];

async function main() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL no está configurado en backend/.env");
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  try {
    await pool.query("DELETE FROM users WHERE email = ANY($1::TEXT[])", [oldEmails]);

    for (const user of users) {
      await pool.query(
        `
          INSERT INTO users (
            name,
            email,
            password_hash,
            role,
            unit_access,
            email_verified,
            email_verified_at
          )
          VALUES (
            $1,
            LOWER($2),
            $3,
            $4,
            ARRAY['DVSO']::TEXT[],
            TRUE,
            NOW()
          )
          ON CONFLICT (email)
          DO UPDATE SET
            name = EXCLUDED.name,
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            unit_access = ARRAY['DVSO']::TEXT[],
            email_verified = TRUE,
            email_verified_at = COALESCE(users.email_verified_at, NOW())
        `,
        [user.name, user.email, passwordHash, user.role]
      );
      console.log(`${user.code} -> ${user.email} -> ${user.role}`);
    }

    console.log("");
    console.log(`Usuarios DVSO creados/actualizados correctamente. Contraseña: ${PASSWORD}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("No se pudieron crear los usuarios DVSO:", err.message);
  process.exit(1);
});
