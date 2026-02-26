const jwt = require("jsonwebtoken");
const { authRouter } = require("../routes/authRoutes");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET no esta configurado. Agregalo al archivo .env");
  }
  return secret;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "No autenticado." });
  }
  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = payload;
    next();
  } catch (_err) {
    return res.status(401).json({ error: "Token no válido o expirado." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "No autenticado." });
    if (!roles.length || roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: "No autorizado." });
  };
}

module.exports = {
  authRouter,
  requireAuth,
  requireRole
};
