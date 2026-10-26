const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || '';
}

const userId = Number.parseInt(arg('user-id'), 10);
const from = arg('from');
const to = arg('to');
const expectedCount = Number.parseInt(arg('confirm-count'), 10);
const backupPath = arg('backup');

function fail(message) {
  console.error(message);
  console.error('Uso: node scripts/delete-submission-burst.js --user-id=123 --from=2026-10-21T10:00:00-06:00 --to=2026-10-21T10:10:00-06:00 --confirm-count=6000 --backup=/ruta/respaldo.dump');
  process.exit(1);
}

if (!process.env.DATABASE_URL) fail('DATABASE_URL no está configurado.');
if (!Number.isInteger(userId) || userId <= 0) fail('Debes indicar un user-id válido.');
if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || Date.parse(from) >= Date.parse(to)) fail('El intervalo from/to no es válido.');
if (!Number.isInteger(expectedCount) || expectedCount <= 0) fail('Debes confirmar la cantidad exacta de registros.');
if (!backupPath || !fs.existsSync(backupPath) || fs.statSync(backupPath).size <= 0) fail('Debes indicar un archivo de respaldo existente y no vacío.');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const countResult = await client.query(
      `SELECT COUNT(*)::INTEGER AS total
         FROM submissions
        WHERE created_by_user_id = $1
          AND created_at >= $2::TIMESTAMPTZ
          AND created_at < $3::TIMESTAMPTZ`,
      [userId, from, to]
    );
    const actualCount = Number(countResult.rows[0]?.total || 0);
    if (actualCount !== expectedCount) {
      throw new Error(`Operación cancelada: se esperaban ${expectedCount} registros, pero el filtro encontró ${actualCount}.`);
    }
    const deleted = await client.query(
      `DELETE FROM submissions
        WHERE created_by_user_id = $1
          AND created_at >= $2::TIMESTAMPTZ
          AND created_at < $3::TIMESTAMPTZ
      RETURNING id`,
      [userId, from, to]
    );
    await client.query('COMMIT');
    console.log(JSON.stringify({ deleted: deleted.rowCount, user_id: userId, from, to, backup: backupPath }, null, 2));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
