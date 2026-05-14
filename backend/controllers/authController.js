const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");
const { sendMail } = require("../config/mailer");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const EMAIL_VERIFY_EXPIRES_MINUTES = 60;
const PASSWORD_RESET_EXPIRES_MINUTES = 30;
const FULL_NAME_REGEX = /^\p{L}+(?:[-']\p{L}+)?\s+\p{L}+(?:[-']\p{L}+)?$/u;

function sanitizeText(value, maxLen = 255) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLen);
}

function normalizeEmail(email = "") {
  return sanitizeText(email, 320).toLowerCase();
}

function isValidFullName(name = "") {
  return FULL_NAME_REGEX.test(sanitizeText(name, 120));
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET no está configurado");
  }
  return secret;
}

function getFrontendBaseUrl() {
  return String(
    process.env.FRONTEND_BASE_URL ||
    process.env.APP_BASE_URL ||
    "http://localhost:4200"
  ).trim().replace(/\/+$/, "");
}

function isDevelopmentVerificationEnabled() {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.ALLOW_DEV_AUTH_LINKS || "").trim().toLowerCase()
  );
}

function signAuthToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name || null,
    role: user.role || "user"
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

function createEmailVerificationToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      type: "email_verification"
    },
    getJwtSecret(),
    { expiresIn: `${EMAIL_VERIFY_EXPIRES_MINUTES}m` }
  );
}

function createPasswordResetToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      type: "password_reset"
    },
    getJwtSecret(),
    { expiresIn: `${PASSWORD_RESET_EXPIRES_MINUTES}m` }
  );
}

function buildVerificationUrl(token) {
  return `${getFrontendBaseUrl()}/auth?verify=${encodeURIComponent(token)}`;
}

function buildPasswordResetUrl(token) {
  return `${getFrontendBaseUrl()}/auth?reset=${encodeURIComponent(token)}`;
}

function buildVerificationMail({ name, verifyUrl }) {
  const safeName = sanitizeText(name, 120) || "usuario";
  return {
    subject: "Confirma tu correo para activar tu cuenta",
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #12324d; line-height: 1.6;">
        <h2 style="margin-bottom: 12px;">Verificación de correo</h2>
        <p>Hola ${safeName},</p>
        <p>Para activar tu cuenta, confirma tu correo usando el siguiente enlace:</p>
        <p>
          <a
            href="${verifyUrl}"
            style="display:inline-block;padding:10px 16px;background:#0b8fd9;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700;">
            Confirmar correo
          </a>
        </p>
        <p>Si el botón no abre, copia y pega este enlace en tu navegador:</p>
        <p style="word-break: break-all;">${verifyUrl}</p>
        <p>Este enlace vence en ${EMAIL_VERIFY_EXPIRES_MINUTES} minutos.</p>
      </div>
    `,
    text:
      `Hola ${safeName},\n\n` +
      `Para activar tu cuenta, confirma tu correo con este enlace:\n${verifyUrl}\n\n` +
      `Este enlace vence en ${EMAIL_VERIFY_EXPIRES_MINUTES} minutos.`
  };
}

function buildPasswordResetMail({ name, resetUrl }) {
  const safeName = sanitizeText(name, 120) || "usuario";
  return {
    subject: "Restablece tu contraseña",
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #12324d; line-height: 1.6;">
        <h2 style="margin-bottom: 12px;">Recuperación de contraseña</h2>
        <p>Hola ${safeName},</p>
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p>
          <a
            href="${resetUrl}"
            style="display:inline-block;padding:10px 16px;background:#0b8fd9;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700;">
            Crear nueva contraseña
          </a>
        </p>
        <p>Si tú no solicitaste este cambio, puedes ignorar este correo.</p>
        <p>Si el botón no abre, copia y pega este enlace en tu navegador:</p>
        <p style="word-break: break-all;">${resetUrl}</p>
        <p>Este enlace vence en ${PASSWORD_RESET_EXPIRES_MINUTES} minutos.</p>
      </div>
    `,
    text:
      `Hola ${safeName},\n\n` +
      `Usa este enlace para crear una nueva contraseña:\n${resetUrl}\n\n` +
      `Este enlace vence en ${PASSWORD_RESET_EXPIRES_MINUTES} minutos.\n` +
      `Si no solicitaste este cambio, ignora este correo.`
  };
}

async function storeVerificationToken(userId, token) {
  const expiresAt = new Date(Date.now() + EMAIL_VERIFY_EXPIRES_MINUTES * 60 * 1000);
  await pool.query(
    `UPDATE users
     SET email_verification_token = $1,
         email_verification_expires = $2
     WHERE id = $3`,
    [token, expiresAt, userId]
  );
  return expiresAt;
}

async function storePasswordResetToken(userId, token) {
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_MINUTES * 60 * 1000);
  await pool.query(
    `UPDATE users
     SET password_reset_token = $1,
         password_reset_expires = $2
     WHERE id = $3`,
    [token, expiresAt, userId]
  );
  return expiresAt;
}

async function dispatchVerificationEmail(user) {
  const token = createEmailVerificationToken(user);
  const verifyUrl = buildVerificationUrl(token);
  await storeVerificationToken(user.id, token);

  const mail = buildVerificationMail({
    name: user.name || user.email,
    verifyUrl
  });

  let emailSent = false;
  try {
    await sendMail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    });
    emailSent = true;
  } catch (err) {
    console.error("No se pudo enviar correo de verificación", err);
  }

  return {
    token,
    verifyUrl,
    emailSent
  };
}

async function dispatchPasswordResetEmail(user) {
  const token = createPasswordResetToken(user);
  const resetUrl = buildPasswordResetUrl(token);
  await storePasswordResetToken(user.id, token);

  const mail = buildPasswordResetMail({
    name: user.name || user.email,
    resetUrl
  });

  let emailSent = false;
  try {
    await sendMail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    });
    emailSent = true;
  } catch (err) {
    console.error("No se pudo enviar correo de recuperación", err);
  }

  return {
    token,
    resetUrl,
    emailSent
  };
}

async function register(req, res) {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const name = sanitizeText(req.body?.name, 120) || null;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Correo y contraseña son obligatorios." });
  }
  if (!isValidFullName(name)) {
    return res.status(400).json({ error: "Ingresa un nombre y un apellido." });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: "Correo no válido." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  }

  try {
    const existing = await pool.query(
      "SELECT id, email_verified, name, email FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );
    if (existing.rowCount) {
      return res.status(409).json({ error: "El correo ya está registrado." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await pool.query(
      `INSERT INTO users (
         name,
         email,
         password_hash,
         role,
         email_verified,
         email_verified_at,
         email_verification_token,
         email_verification_expires
       )
       VALUES ($1, $2, $3, $4, $5, NULL, NULL, NULL)
       RETURNING id, name, email, role, email_verified`,
      [name, email, passwordHash, "user", false]
    );

    const user = created.rows[0];
    const verification = await dispatchVerificationEmail(user);

    const response = {
      message: verification.emailSent
        ? "Cuenta creada. Revisa tu correo para verificarla."
        : "Cuenta creada. No se pudo enviar el correo automáticamente; usa el enlace de verificación en desarrollo.",
      requires_verification: true,
      email_sent: verification.emailSent
    };

    if (isDevelopmentVerificationEnabled()) {
      response.dev_verify_url = verification.verifyUrl;
    }

    return res.status(201).json(response);
  } catch (err) {
    console.error("Error registrando usuario", err);
    return res.status(500).json({ error: "No se pudo registrar al usuario." });
  }
}

async function verifyEmail(req, res) {
  const token = String(req.query?.token || "").trim();
  if (!token) {
    return res.status(400).json({ error: "Token de verificación requerido." });
  }

  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret());
  } catch {
    return res.status(400).json({ error: "El enlace de verificación es inválido o expiró." });
  }

  if (payload?.type !== "email_verification" || !payload?.sub) {
    return res.status(400).json({ error: "Token de verificación inválido." });
  }

  try {
    const result = await pool.query(
      `SELECT id, email_verified, email_verification_token, email_verification_expires
       FROM users
       WHERE id = $1`,
      [payload.sub]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    const user = result.rows[0];
    if (user.email_verified) {
      return res.json({ message: "El correo ya estaba verificado. Ya puedes iniciar sesión." });
    }

    if (!user.email_verification_token || user.email_verification_token !== token) {
      return res.status(400).json({ error: "El enlace de verificación ya no es válido." });
    }

    if (user.email_verification_expires && new Date(user.email_verification_expires) < new Date()) {
      return res.status(400).json({ error: "El enlace de verificación expiró. Solicita uno nuevo." });
    }

    await pool.query(
      `UPDATE users
       SET email_verified = TRUE,
           email_verified_at = NOW(),
           email_verification_token = NULL,
           email_verification_expires = NULL
       WHERE id = $1`,
      [user.id]
    );

    return res.json({ message: "Correo verificado correctamente. Ya puedes iniciar sesión." });
  } catch (err) {
    console.error("Error verificando correo", err);
    return res.status(500).json({ error: "No se pudo verificar el correo." });
  }
}

async function resendVerification(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ error: "Correo requerido." });
  }

  try {
    const result = await pool.query(
      `SELECT id, name, email, role, email_verified
       FROM users
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "No existe una cuenta registrada con ese correo." });
    }

    const user = result.rows[0];
    if (user.email_verified) {
      return res.json({ message: "Ese correo ya está verificado. Ya puedes iniciar sesión." });
    }

    const verification = await dispatchVerificationEmail(user);
    const response = {
      message: verification.emailSent
        ? "Se envió un nuevo enlace de verificación."
        : "No se pudo enviar el correo automáticamente; usa el enlace de verificación en desarrollo."
    };

    if (isDevelopmentVerificationEnabled()) {
      response.dev_verify_url = verification.verifyUrl;
    }

    return res.json(response);
  } catch (err) {
    console.error("Error reenviando verificación", err);
    return res.status(500).json({ error: "No se pudo reenviar la verificación." });
  }
}

async function forgotPassword(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ error: "Correo requerido." });
  }

  try {
    const result = await pool.query(
      `SELECT id, name, email
       FROM users
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (!result.rowCount) {
      return res.json({
        message: "Si existe una cuenta con ese correo, enviaremos un enlace para restablecer la contraseña."
      });
    }

    const user = result.rows[0];
    const reset = await dispatchPasswordResetEmail(user);
    const response = {
      message: reset.emailSent
        ? "Si existe una cuenta con ese correo, enviaremos un enlace para restablecer la contraseña."
        : "No se pudo enviar el correo automáticamente."
    };

    if (isDevelopmentVerificationEnabled()) {
      response.dev_reset_url = reset.resetUrl;
    }

    return res.json(response);
  } catch (err) {
    console.error("Error solicitando recuperación de contraseña", err);
    return res.status(500).json({ error: "No se pudo procesar la solicitud." });
  }
}

async function resetPassword(req, res) {
  const token = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "");

  if (!token || !password) {
    return res.status(400).json({ error: "Token y contraseña son obligatorios." });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  }

  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret());
  } catch {
    return res.status(400).json({ error: "El enlace de recuperación es inválido o expiró." });
  }

  if (payload?.type !== "password_reset" || !payload?.sub) {
    return res.status(400).json({ error: "Token de recuperación inválido." });
  }

  try {
    const result = await pool.query(
      `SELECT id, password_reset_token, password_reset_expires
       FROM users
       WHERE id = $1`,
      [payload.sub]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    const user = result.rows[0];
    if (!user.password_reset_token || user.password_reset_token !== token) {
      return res.status(400).json({ error: "El enlace de recuperación ya no es válido." });
    }

    if (user.password_reset_expires && new Date(user.password_reset_expires) < new Date()) {
      return res.status(400).json({ error: "El enlace de recuperación expiró. Solicita uno nuevo." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           password_reset_token = NULL,
           password_reset_expires = NULL
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    return res.json({ message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión." });
  } catch (err) {
    console.error("Error restableciendo contraseña", err);
    return res.status(500).json({ error: "No se pudo restablecer la contraseña." });
  }
}

async function login(req, res) {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ error: "Correo y contraseña son obligatorios." });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, name, password_hash, role, email_verified
       FROM users
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (!result.rowCount) {
      return res.status(401).json({ error: "Credenciales incorrectas." });
    }

    const user = result.rows[0];
    const matches = await bcrypt.compare(password, user.password_hash || "");
    if (!matches) {
      return res.status(401).json({ error: "Credenciales incorrectas." });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        error: "Debes verificar tu correo antes de iniciar sesión.",
        code: "EMAIL_NOT_VERIFIED"
      });
    }

    const token = signAuthToken(user);
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Error en login", err);
    return res.status(500).json({ error: "No se pudo iniciar sesión." });
  }
}

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  login
};
