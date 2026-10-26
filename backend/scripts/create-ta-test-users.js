require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Cuentas exclusivamente para pruebas locales del certificado de línea aérea.
const users = [
  { code: 'ta2', password: '2', role: 'analista_servicios_aereos', label: 'Analista de Servicios Aéreos' },
  { code: 'ta3', password: '3', role: 'jefatura_transporte_aereo', label: 'Jefatura de Transporte Aéreo' },
  { code: 'ta4', password: '4', role: 'asesoria_juridica_transporte_aereo', label: 'Asesoría Jurídica' },
  { code: 'ta5', password: '5', role: 'despacho_superior_transporte_aereo', label: 'Despacho Superior' }
];

const obsoleteApplicantAccounts = [
  { code: 'ta1', label: 'Usuario solicitante' },
  { code: 'ta6', label: 'Segundo usuario solicitante' }
];

function testUserName(user) {
  return `TA Prueba ${user.code.slice(2)} - ${user.label}`;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL no está configurada.');
  const address = new URL(databaseUrl);
  if (String(process.env.NODE_ENV || 'development').toLowerCase() === 'production' ||
      !['localhost', '127.0.0.1', '::1'].includes(address.hostname)) {
    throw new Error('Las contraseñas numéricas de prueba solo se permiten en una base de datos local de desarrollo.');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const emails = users.map((user) => `${user.code}@gmail.com`);
    const oldEmails = users.map((user) => `${user.code}@example.com`);
    for (const obsolete of obsoleteApplicantAccounts) {
      const obsoleteEmails = [`${obsolete.code}@gmail.com`, `${obsolete.code}@example.com`];
      const obsoleteName = testUserName(obsolete);
      const existingApplicant = await client.query(
        'SELECT email, name, role FROM users WHERE email = ANY($1::text[])',
        [obsoleteEmails]
      );
      const unrelatedApplicant = existingApplicant.rows.find((row) => row.name !== obsoleteName || row.role !== 'user');
      if (unrelatedApplicant) {
        throw new Error(`La cuenta ${unrelatedApplicant.email} existe, pero no corresponde al solicitante de prueba que se desea retirar.`);
      }
      await client.query(
        'DELETE FROM users WHERE email = ANY($1::text[]) AND name = $2 AND role = $3',
        [obsoleteEmails, obsoleteName, 'user']
      );
    }
    const existing = await client.query('SELECT email, name FROM users WHERE email = ANY($1::text[])', [[...emails, ...oldEmails]]);
    const unrelated = existing.rows.find((row) => {
      const index = [...emails, ...oldEmails].indexOf(row.email) % users.length;
      return row.name !== testUserName(users[index]);
    });
    if (unrelated) throw new Error(`La cuenta ${unrelated.email} ya existe y no es una cuenta de prueba TA.`);
    for (let index = 0; index < users.length; index += 1) {
      const targetExists = existing.rows.some((row) => row.email === emails[index]);
      const oldExists = existing.rows.some((row) => row.email === oldEmails[index]);
      if (targetExists && oldExists) throw new Error(`Existen dos cuentas para ${users[index].code}; revisa los datos antes de continuar.`);
      if (!targetExists) {
        await client.query(
          'UPDATE users SET email = $1 WHERE email = $2 AND name LIKE $3',
          [emails[index], oldEmails[index], `TA Prueba ${users[index].code.slice(2)} - %`]
        );
      }
    }

    for (let index = 0; index < users.length; index += 1) {
      const user = users[index];
      const passwordHash = await bcrypt.hash(user.password, 10);
      await client.query(
        `INSERT INTO users (name, email, password_hash, role, unit_access, email_verified, email_verified_at)
         VALUES ($1, $2, $3, $4, ARRAY['TRANSPORTE_AEREO']::TEXT[], TRUE, NOW())
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           unit_access = EXCLUDED.unit_access,
           email_verified = TRUE,
           email_verified_at = COALESCE(users.email_verified_at, NOW())`,
        [testUserName(user), emails[index], passwordHash, user.role]
      );
    }
    const saved = await client.query(
      'SELECT email, role, unit_access, password_hash FROM users WHERE email = ANY($1::text[])',
      [emails]
    );
    if (saved.rowCount !== users.length) throw new Error('No se guardaron las seis cuentas de prueba.');
    const oldRemaining = await client.query('SELECT email FROM users WHERE email = ANY($1::text[])', [oldEmails]);
    if (oldRemaining.rowCount) throw new Error('Quedaron cuentas de prueba con el dominio anterior.');
    for (let index = 0; index < users.length; index += 1) {
      const account = saved.rows.find((row) => row.email === emails[index]);
      if (!account || account.role !== users[index].role ||
          !account.unit_access.includes('TRANSPORTE_AEREO') ||
          !await bcrypt.compare(users[index].password, account.password_hash)) {
        throw new Error(`La cuenta ${users[index].code} no superó la verificación.`);
      }
    }
    const obsoleteEmails = obsoleteApplicantAccounts.flatMap((user) => [`${user.code}@gmail.com`, `${user.code}@example.com`]);
    const obsoleteRemaining = await client.query('SELECT email FROM users WHERE email = ANY($1::text[])', [obsoleteEmails]);
    if (obsoleteRemaining.rowCount) throw new Error('Todavía existen cuentas solicitantes de prueba con correo TA.');
    await client.query('COMMIT');
    for (let index = 0; index < users.length; index += 1) {
      console.log(`${users[index].code}@gmail.com | ${users[index].role} | contraseña: ${users[index].password}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
