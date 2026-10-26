const { Pool } = require('pg');
require('dotenv').config();

function integerArg(name, fallback, min, max) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

const hours = integerArg('hours', 24, 1, 24 * 90);
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL no está configurado.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const accounts = await pool.query(
      `SELECT s.created_by_user_id AS user_id,
              COALESCE(u.email, s.correo, 'SIN CORREO') AS email,
              COALESCE(u.name, 'SIN NOMBRE') AS nombre,
              COUNT(*)::INTEGER AS total,
              MIN(s.created_at) AS primer_envio,
              MAX(s.created_at) AS ultimo_envio,
              ARRAY_AGG(DISTINCT s.unidad_clave ORDER BY s.unidad_clave) AS unidades
         FROM submissions s
         LEFT JOIN users u ON u.id = s.created_by_user_id
        WHERE s.created_at >= NOW() - ($1::INTEGER * INTERVAL '1 hour')
        GROUP BY s.created_by_user_id, COALESCE(u.email, s.correo, 'SIN CORREO'), COALESCE(u.name, 'SIN NOMBRE')
        ORDER BY total DESC, primer_envio DESC
        LIMIT 100`,
      [hours]
    );

    const bursts = await pool.query(
      `SELECT s.created_by_user_id AS user_id,
              COALESCE(u.email, s.correo, 'SIN CORREO') AS email,
              DATE_TRUNC('minute', s.created_at) AS minuto,
              COUNT(*)::INTEGER AS total,
              ARRAY_AGG(DISTINCT s.unidad_clave ORDER BY s.unidad_clave) AS unidades,
              ARRAY_AGG(DISTINCT COALESCE(s.detalle_formulario->>'slug', s.gestion_nombre, 'SIN TIPO') ORDER BY COALESCE(s.detalle_formulario->>'slug', s.gestion_nombre, 'SIN TIPO')) AS procesos
         FROM submissions s
         LEFT JOIN users u ON u.id = s.created_by_user_id
        WHERE s.created_at >= NOW() - ($1::INTEGER * INTERVAL '1 hour')
        GROUP BY s.created_by_user_id, COALESCE(u.email, s.correo, 'SIN CORREO'), DATE_TRUNC('minute', s.created_at)
       HAVING COUNT(*) >= 5
        ORDER BY total DESC, minuto DESC
        LIMIT 200`,
      [hours]
    );

    console.log(JSON.stringify({ generated_at: new Date().toISOString(), hours, accounts: accounts.rows, bursts: bursts.rows }, null, 2));
  } catch (err) {
    console.error(err.stack || err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
