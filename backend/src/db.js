const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function init() {
  // Users table for auth
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      unit_access TEXT[] NOT NULL DEFAULT ARRAY['GENERAL','RAN','DVSO','AILA','FINANCIERO']::TEXT[],
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      email_verified_at TIMESTAMPTZ,
      email_verification_token TEXT,
      email_verification_expires TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx
      ON users (LOWER(email));
  `);

  // Create table with full schema
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      fecha DATE,
      persona_tipo TEXT NOT NULL DEFAULT 'individual',
      unidad_clave TEXT NOT NULL DEFAULT 'GENERAL',
      gestion_nombre TEXT,
      registro_codigo TEXT,
      nombre_propietario TEXT NOT NULL,
      representante_legal TEXT,
      documento_propietario TEXT,
      direccion TEXT,
      telefono TEXT,
      correo TEXT NOT NULL,
      nit TEXT,
      nombre_orden_pago TEXT,
      autorizado_nombre TEXT,
      autorizado_documento TEXT,
      autorizado_telefono TEXT,
      ubicacion_inspeccion TEXT,
      matricula_tg TEXT,
      matricula_tg_nueva TEXT,
      uso TEXT,
      fabricante TEXT,
      numero_serie TEXT,
      modelo TEXT,
      anio_fabricacion TEXT,
      colores TEXT,
      tipo_internacion BOOLEAN DEFAULT FALSE,
      tipo_reservacion BOOLEAN DEFAULT FALSE,
      tipo_inscripcion BOOLEAN DEFAULT FALSE,
      tipo_certificado_prov BOOLEAN DEFAULT FALSE,
      tipo_reposicion BOOLEAN DEFAULT FALSE,
      tipo_cambio_prop BOOLEAN DEFAULT FALSE,
      tipo_cambio_datos BOOLEAN DEFAULT FALSE,
      tipo_certificacion BOOLEAN DEFAULT FALSE,
      especificaciones TEXT,
      comentarios_revision TEXT,
      dpi_pdf BYTEA,
      dpi_filename TEXT,
      dpi_mime TEXT,
      acta_pdf BYTEA,
      acta_filename TEXT,
      acta_mime TEXT,
      registro_mercantil_pdf BYTEA,
      registro_mercantil_filename TEXT,
      registro_mercantil_mime TEXT,
      analyst_pdf BYTEA,
      analyst_pdf_filename TEXT,
      analyst_pdf_mime TEXT,
      analyst_pdf_uploaded_at TIMESTAMPTZ,
      analyst_pdf_uploaded_by_user_id INTEGER,
      assigned_analista_id INTEGER,
      assigned_aprobador_id INTEGER,
      sent_to_aprobador_at TIMESTAMPTZ,
      receptor_opened_at TIMESTAMPTZ,
      created_by_user_id INTEGER,
      approved_at TIMESTAMPTZ,
      approved_by_user_id INTEGER,
      returned_at TIMESTAMPTZ,
      returned_reason TEXT,
      returned_by_user_id INTEGER,
      returned_to_analista_at TIMESTAMPTZ,
      returned_to_analista_reason TEXT,
      returned_to_analista_by_user_id INTEGER
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS submission_counters (
      unit_clave TEXT NOT NULL,
      year_value INTEGER NOT NULL,
      last_number INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (unit_clave, year_value)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS submission_logs (
      id SERIAL PRIMARY KEY,
      submission_id INTEGER NOT NULL,
      event_code TEXT NOT NULL,
      event_label TEXT NOT NULL,
      event_detail TEXT,
      actor_user_id INTEGER,
      actor_role TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS submission_logs_submission_created_idx
      ON submission_logs (submission_id, created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS submission_feedback (
      id SERIAL PRIMARY KEY,
      submission_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating_value INTEGER NOT NULL CHECK (rating_value BETWEEN 1 AND 5),
      comment TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS submission_feedback_submission_user_idx
      ON submission_feedback (submission_id, user_id);
  `);

  // Safety: add missing columns if table already existed with older schema
  const alters = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS unit_access TEXT[] NOT NULL DEFAULT ARRAY['GENERAL','RAN','DVSO','AILA','FINANCIERO']::TEXT[]",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token_hash TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token_expires_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()",
    "CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email))",
    "CREATE INDEX IF NOT EXISTS users_email_verify_token_hash_idx ON users(email_verify_token_hash) WHERE email_verify_token_hash IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS users_email_verification_token_idx ON users(email_verification_token) WHERE email_verification_token IS NOT NULL",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS fecha DATE",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS persona_tipo TEXT NOT NULL DEFAULT 'individual'",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS unidad_clave TEXT NOT NULL DEFAULT 'GENERAL'",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS gestion_nombre TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS registro_codigo TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS nombre_propietario TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS representante_legal TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS documento_propietario TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS direccion TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS telefono TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS correo TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS nit TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS nombre_orden_pago TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS autorizado_nombre TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS autorizado_documento TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS autorizado_telefono TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ubicacion_inspeccion TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS matricula_tg TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS matricula_tg_nueva TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS uso TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS fabricante TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS numero_serie TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS modelo TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS anio_fabricacion TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS colores TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tipo_internacion BOOLEAN DEFAULT FALSE",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tipo_reservacion BOOLEAN DEFAULT FALSE",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tipo_inscripcion BOOLEAN DEFAULT FALSE",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tipo_certificado_prov BOOLEAN DEFAULT FALSE",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tipo_reposicion BOOLEAN DEFAULT FALSE",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tipo_cambio_prop BOOLEAN DEFAULT FALSE",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tipo_cambio_datos BOOLEAN DEFAULT FALSE",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tipo_certificacion BOOLEAN DEFAULT FALSE",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS especificaciones TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS comentarios_revision TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS dpi_pdf BYTEA",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS dpi_filename TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS dpi_mime TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS acta_pdf BYTEA",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS acta_filename TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS acta_mime TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS registro_mercantil_pdf BYTEA",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS registro_mercantil_filename TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS registro_mercantil_mime TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS analyst_pdf BYTEA",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS analyst_pdf_filename TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS analyst_pdf_mime TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS analyst_pdf_uploaded_at TIMESTAMPTZ",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS analyst_pdf_uploaded_by_user_id INTEGER",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS assigned_analista_id INTEGER",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS assigned_aprobador_id INTEGER",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS sent_to_aprobador_at TIMESTAMPTZ",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS receptor_opened_at TIMESTAMPTZ",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS approved_by_user_id INTEGER",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS returned_reason TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS returned_by_user_id INTEGER",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS returned_to_analista_at TIMESTAMPTZ",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS returned_to_analista_reason TEXT",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS returned_to_analista_by_user_id INTEGER",
    "CREATE UNIQUE INDEX IF NOT EXISTS submissions_registro_codigo_unique_idx ON submissions(registro_codigo) WHERE registro_codigo IS NOT NULL",
    `CREATE TABLE IF NOT EXISTS submission_counters (
       unit_clave TEXT NOT NULL,
       year_value INTEGER NOT NULL,
       last_number INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (unit_clave, year_value)
     )`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'submissions_assigned_user_fkey'
       ) THEN
         ALTER TABLE submissions
           ADD CONSTRAINT submissions_assigned_user_fkey
           FOREIGN KEY (assigned_analista_id)
         REFERENCES users(id)
         ON DELETE SET NULL;
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'submissions_analyst_pdf_uploaded_by_fkey'
       ) THEN
         ALTER TABLE submissions
           ADD CONSTRAINT submissions_analyst_pdf_uploaded_by_fkey
           FOREIGN KEY (analyst_pdf_uploaded_by_user_id)
           REFERENCES users(id)
           ON DELETE SET NULL;
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'submissions_returned_to_analista_by_user_fkey'
       ) THEN
         ALTER TABLE submissions
           ADD CONSTRAINT submissions_returned_to_analista_by_user_fkey
           FOREIGN KEY (returned_to_analista_by_user_id)
           REFERENCES users(id)
           ON DELETE SET NULL;
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'submissions_assigned_aprobador_fkey'
       ) THEN
         ALTER TABLE submissions
           ADD CONSTRAINT submissions_assigned_aprobador_fkey
           FOREIGN KEY (assigned_aprobador_id)
           REFERENCES users(id)
           ON DELETE SET NULL;
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'submission_logs_submission_fkey'
       ) THEN
         ALTER TABLE submission_logs
           ADD CONSTRAINT submission_logs_submission_fkey
           FOREIGN KEY (submission_id)
           REFERENCES submissions(id)
           ON DELETE CASCADE;
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'submission_logs_actor_user_fkey'
       ) THEN
         ALTER TABLE submission_logs
           ADD CONSTRAINT submission_logs_actor_user_fkey
           FOREIGN KEY (actor_user_id)
           REFERENCES users(id)
           ON DELETE SET NULL;
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'submission_feedback_submission_fkey'
       ) THEN
         ALTER TABLE submission_feedback
           ADD CONSTRAINT submission_feedback_submission_fkey
           FOREIGN KEY (submission_id)
           REFERENCES submissions(id)
           ON DELETE CASCADE;
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'submission_feedback_user_fkey'
       ) THEN
         ALTER TABLE submission_feedback
           ADD CONSTRAINT submission_feedback_user_fkey
           FOREIGN KEY (user_id)
           REFERENCES users(id)
           ON DELETE CASCADE;
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'submission_feedback_rating_check'
       ) THEN
         ALTER TABLE submission_feedback
           ADD CONSTRAINT submission_feedback_rating_check
           CHECK (rating_value BETWEEN 1 AND 5);
       END IF;
     END $$`,
    "CREATE INDEX IF NOT EXISTS submission_logs_submission_created_idx ON submission_logs (submission_id, created_at DESC)",
    `CREATE TABLE IF NOT EXISTS submission_feedback (
       id SERIAL PRIMARY KEY,
       submission_id INTEGER NOT NULL,
       user_id INTEGER NOT NULL,
       rating_value INTEGER NOT NULL CHECK (rating_value BETWEEN 1 AND 5),
       comment TEXT,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       updated_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    "ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS comment TEXT",
    "ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()",
    "ALTER TABLE submission_feedback ALTER COLUMN updated_at SET DEFAULT NOW()",
    "CREATE UNIQUE INDEX IF NOT EXISTS submission_feedback_submission_user_idx ON submission_feedback (submission_id, user_id)",
    "CREATE INDEX IF NOT EXISTS submission_feedback_submission_idx ON submission_feedback (submission_id)",
    "CREATE INDEX IF NOT EXISTS submission_feedback_user_idx ON submission_feedback (user_id)",
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'submissions_returned_by_user_fkey'
       ) THEN
         ALTER TABLE submissions
           ADD CONSTRAINT submissions_returned_by_user_fkey
           FOREIGN KEY (returned_by_user_id)
           REFERENCES users(id)
           ON DELETE SET NULL;
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'submissions_created_by_user_fkey'
       ) THEN
         ALTER TABLE submissions
           ADD CONSTRAINT submissions_created_by_user_fkey
           FOREIGN KEY (created_by_user_id)
           REFERENCES users(id)
           ON DELETE SET NULL;
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'submissions_approved_by_user_fkey'
       ) THEN
         ALTER TABLE submissions
           ADD CONSTRAINT submissions_approved_by_user_fkey
           FOREIGN KEY (approved_by_user_id)
           REFERENCES users(id)
           ON DELETE SET NULL;
       END IF;
     END $$`,
    // Renombrar columnas antiguas a espanol si existen
    `DO $$
     BEGIN
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='owner_name') THEN
         BEGIN
           ALTER TABLE submissions RENAME COLUMN owner_name TO nombre_propietario;
         EXCEPTION WHEN duplicate_column THEN NULL; END;
       END IF;
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='owner_document') THEN
         BEGIN
           ALTER TABLE submissions RENAME COLUMN owner_document TO documento_propietario;
         EXCEPTION WHEN duplicate_column THEN NULL; END;
       END IF;
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='address') THEN
         BEGIN
           ALTER TABLE submissions RENAME COLUMN address TO direccion;
         EXCEPTION WHEN duplicate_column THEN NULL; END;
       END IF;
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='phone') THEN
         BEGIN
           ALTER TABLE submissions RENAME COLUMN phone TO telefono;
         EXCEPTION WHEN duplicate_column THEN NULL; END;
       END IF;
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='email') THEN
         BEGIN
           ALTER TABLE submissions RENAME COLUMN email TO correo;
         EXCEPTION WHEN duplicate_column THEN NULL; END;
       END IF;
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='authorized_name') THEN
         BEGIN
           ALTER TABLE submissions RENAME COLUMN authorized_name TO autorizado_nombre;
         EXCEPTION WHEN duplicate_column THEN NULL; END;
       END IF;
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='authorized_document') THEN
         BEGIN
           ALTER TABLE submissions RENAME COLUMN authorized_document TO autorizado_documento;
         EXCEPTION WHEN duplicate_column THEN NULL; END;
       END IF;
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='authorized_phone') THEN
         BEGIN
           ALTER TABLE submissions RENAME COLUMN authorized_phone TO autorizado_telefono;
         EXCEPTION WHEN duplicate_column THEN NULL; END;
       END IF;
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='inspection_location') THEN
         BEGIN
           ALTER TABLE submissions RENAME COLUMN inspection_location TO ubicacion_inspeccion;
         EXCEPTION WHEN duplicate_column THEN NULL; END;
       END IF;
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='plane_matricula') THEN
         BEGIN
           ALTER TABLE submissions RENAME COLUMN plane_matricula TO matricula_tg;
         EXCEPTION WHEN duplicate_column THEN NULL; END;
       END IF;
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='plane_matricula_nueva') THEN
         BEGIN
           ALTER TABLE submissions RENAME COLUMN plane_matricula_nueva TO matricula_tg_nueva;
         EXCEPTION WHEN duplicate_column THEN NULL; END;
       END IF;
     END $$`,
    // Legacy columns from earliest version should not block inserts
    `DO $$
     BEGIN
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='name') THEN
         ALTER TABLE submissions ALTER COLUMN name DROP NOT NULL;
       END IF;
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='email') THEN
         ALTER TABLE submissions ALTER COLUMN email DROP NOT NULL;
       END IF;
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='message') THEN
         ALTER TABLE submissions ALTER COLUMN message DROP NOT NULL;
       END IF;
     END $$`
  ];

  for (const statement of alters) {
    await pool.query(statement);
  }

  await pool.query("UPDATE users SET role = 'user' WHERE role IS NULL");
  await pool.query("UPDATE users SET unit_access = ARRAY['GENERAL','RAN','DVSO','AILA','FINANCIERO']::TEXT[] WHERE unit_access IS NULL");
  await pool.query("UPDATE users SET email_verified = TRUE WHERE email_verified IS NULL");
  await pool.query(`
    UPDATE submissions s
    SET created_by_user_id = u.id
    FROM users u
    WHERE s.created_by_user_id IS NULL
      AND LOWER(COALESCE(s.correo, '')) = LOWER(u.email)
  `);
  await pool.query(`
    WITH parsed AS (
      SELECT
        UPPER(NULLIF(regexp_replace(split_part(registro_codigo, '-', 1), '[^A-Za-z0-9]', '', 'g'), '')) AS unit_clave,
        NULLIF(split_part(registro_codigo, '-', 2), '') AS seq_text,
        NULLIF(split_part(registro_codigo, '-', 3), '') AS year_text
      FROM submissions
      WHERE registro_codigo IS NOT NULL
    ),
    valid AS (
      SELECT
        COALESCE(unit_clave, 'GENERAL') AS unit_clave,
        CAST(seq_text AS INTEGER) AS seq_num,
        CAST(year_text AS INTEGER) AS year_value
      FROM parsed
      WHERE seq_text ~ '^[0-9]+$' AND year_text ~ '^[0-9]{4}$'
    )
    INSERT INTO submission_counters (unit_clave, year_value, last_number)
    SELECT unit_clave, year_value, MAX(seq_num) AS last_number
    FROM valid
    GROUP BY unit_clave, year_value
    ON CONFLICT (unit_clave, year_value)
    DO UPDATE SET last_number = GREATEST(submission_counters.last_number, EXCLUDED.last_number)
  `);
  await pool.query(`
    WITH normalized AS (
      SELECT
        s.id,
        UPPER(NULLIF(regexp_replace(COALESCE(s.unidad_clave, 'GENERAL'), '[^A-Za-z0-9]', '', 'g'), '')) AS unit_clave,
        EXTRACT(YEAR FROM COALESCE(s.created_at, NOW()))::INTEGER AS year_value,
        s.created_at
      FROM submissions s
      WHERE s.registro_codigo IS NULL
    ),
    ordered AS (
      SELECT
        n.id,
        COALESCE(n.unit_clave, 'GENERAL') AS unit_clave,
        n.year_value,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(n.unit_clave, 'GENERAL'), n.year_value
          ORDER BY n.created_at, n.id
        ) AS seq
      FROM normalized n
    ),
    offsets AS (
      SELECT
        o.id,
        o.unit_clave,
        o.year_value,
        o.seq + COALESCE(c.last_number, 0) AS final_seq
      FROM ordered o
      LEFT JOIN submission_counters c
        ON c.unit_clave = o.unit_clave
       AND c.year_value = o.year_value
    ),
    updated AS (
      UPDATE submissions s
      SET registro_codigo = offsets.unit_clave || '-' || LPAD(offsets.final_seq::TEXT, 2, '0') || '-' || offsets.year_value::TEXT
      FROM offsets
      WHERE s.id = offsets.id
      RETURNING offsets.unit_clave, offsets.year_value, offsets.final_seq
    )
    INSERT INTO submission_counters (unit_clave, year_value, last_number)
    SELECT unit_clave, year_value, MAX(final_seq)
    FROM updated
    GROUP BY unit_clave, year_value
    ON CONFLICT (unit_clave, year_value)
    DO UPDATE SET last_number = GREATEST(submission_counters.last_number, EXCLUDED.last_number)
  `);

  // Migrar datos desde columnas antiguas si quedo alguna, y luego eliminarlas
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='owner_name') THEN
        UPDATE submissions
        SET nombre_propietario = COALESCE(nombre_propietario, owner_name);
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='owner_document') THEN
        UPDATE submissions
        SET documento_propietario = COALESCE(documento_propietario, owner_document);
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='address') THEN
        UPDATE submissions
        SET direccion = COALESCE(direccion, address);
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='phone') THEN
        UPDATE submissions
        SET telefono = COALESCE(telefono, phone);
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='email') THEN
        UPDATE submissions
        SET correo = COALESCE(correo, email);
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='authorized_name') THEN
        UPDATE submissions
        SET autorizado_nombre = COALESCE(autorizado_nombre, authorized_name);
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='authorized_document') THEN
        UPDATE submissions
        SET autorizado_documento = COALESCE(autorizado_documento, authorized_document);
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='authorized_phone') THEN
        UPDATE submissions
        SET autorizado_telefono = COALESCE(autorizado_telefono, authorized_phone);
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='inspection_location') THEN
        UPDATE submissions
        SET ubicacion_inspeccion = COALESCE(ubicacion_inspeccion, inspection_location);
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='plane_matricula') THEN
        UPDATE submissions
        SET matricula_tg = COALESCE(matricula_tg, plane_matricula);
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='submissions' AND column_name='plane_matricula_nueva') THEN
        UPDATE submissions
        SET matricula_tg_nueva = COALESCE(matricula_tg_nueva, plane_matricula_nueva);
      END IF;

      -- Eliminar columnas antiguas si existen
      BEGIN
        ALTER TABLE submissions
          DROP COLUMN IF EXISTS owner_name,
          DROP COLUMN IF EXISTS owner_document,
          DROP COLUMN IF EXISTS address,
          DROP COLUMN IF EXISTS phone,
          DROP COLUMN IF EXISTS email,
          DROP COLUMN IF EXISTS authorized_name,
          DROP COLUMN IF EXISTS authorized_document,
          DROP COLUMN IF EXISTS authorized_phone,
          DROP COLUMN IF EXISTS inspection_location,
          DROP COLUMN IF EXISTS plane_matricula,
          DROP COLUMN IF EXISTS plane_matricula_nueva;
      EXCEPTION WHEN undefined_column THEN NULL;
      END;
    END $$;
  `);
}

module.exports = {
  pool,
  init
};
