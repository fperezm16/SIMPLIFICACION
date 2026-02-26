const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

function sanitizeText(value, maxLen = 255) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLen);
}

function normalizeEmail(email = "") {
  return sanitizeText(email, 320).toLowerCase();
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET no esta configurado");
  }
  return secret;
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

async function register(req, res) {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const name = sanitizeText(req.body?.name, 120) || null;

  if (!email || !password) {
    return res.status(400).json({ error: "Correo y contraseña son obligatorios." });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: "Correo no válido." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [email]);
    if (existing.rowCount) {
      return res.status(409).json({ error: "El correo ya está registrado." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
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
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL)`,
      [name, email, passwordHash, "user", true, new Date()]
    );

    return res.status(201).json({
      message: "Usuario creado correctamente.",
      requires_verification: false,
      email_sent: false
    });
  } catch (err) {
    console.error("Error registrando usuario", err);
    return res.status(500).json({ error: "No se pudo registrar al usuario." });
  }
}

async function verifyEmail(req, res) {
  return res.json({ message: "La verificación por correo está deshabilitada." });
}

async function resendVerification(req, res) {
  return res.json({ message: "La verificación por correo está deshabilitada." });
}

async function login(req, res) {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ error: "Correo y contraseña son obligatorios." });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, name, password_hash, role
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
  login
};
