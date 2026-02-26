const dns = require("dns").promises;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const RESERVED_DOMAINS = new Set(["example.com", "test.com", "localhost", "local", "invalid"]);
const DNS_ERROR_CODES = new Set(["ENOTFOUND", "ENODATA", "ESERVFAIL", "ETIMEOUT", "ECONNREFUSED"]);

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function isMxValidationEnabled() {
  const raw = String(process.env.EMAIL_VALIDATE_MX || "true").trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

function hasBasicEmailFormat(email = "") {
  if (!EMAIL_REGEX.test(email)) return false;
  const atIndex = email.lastIndexOf("@");
  const domain = email.slice(atIndex + 1);
  if (!domain || !domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  if (domain.includes("..")) return false;
  return true;
}

async function domainAcceptsEmail(domain) {
  try {
    const mx = await dns.resolveMx(domain);
    if (Array.isArray(mx) && mx.length) return true;
  } catch (err) {
    if (!DNS_ERROR_CODES.has(err?.code)) throw err;
  }

  try {
    const a = await dns.resolve4(domain);
    if (Array.isArray(a) && a.length) return true;
  } catch (err) {
    if (!DNS_ERROR_CODES.has(err?.code)) throw err;
  }

  try {
    const aaaa = await dns.resolve6(domain);
    if (Array.isArray(aaaa) && aaaa.length) return true;
  } catch (err) {
    if (!DNS_ERROR_CODES.has(err?.code)) throw err;
  }

  return false;
}

async function validateEmailAddress(rawEmail) {
  const email = normalizeEmail(rawEmail);
  if (!email) {
    return { ok: false, email: "", error: "Correo obligatorio." };
  }
  if (!hasBasicEmailFormat(email)) {
    return { ok: false, email, error: "Correo no válido. Revisa el formato." };
  }

  const domain = email.split("@")[1] || "";
  if (RESERVED_DOMAINS.has(domain)) {
    return { ok: false, email, error: "Correo no válido. Usa un dominio real." };
  }

  if (!isMxValidationEnabled()) {
    return { ok: true, email };
  }

  try {
    const hasRecords = await domainAcceptsEmail(domain);
    if (!hasRecords) {
      return { ok: false, email, error: "Correo no válido. El dominio no recibe correos." };
    }
    return { ok: true, email };
  } catch (err) {
    console.error("Error validando dominio de correo", err);
    return { ok: false, email, error: "No se pudo validar el correo. Intenta de nuevo." };
  }
}

module.exports = {
  normalizeEmail,
  validateEmailAddress
};
