const nodemailer = require("nodemailer");

let transporter = null;

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function getSmtpConfig() {
  return {
    host: String(process.env.SMTP_HOST || "").trim(),
    port: Number(process.env.SMTP_PORT || 465),
    secure: normalizeBoolean(process.env.SMTP_SECURE, true),
    user: String(process.env.SMTP_USER || "").trim(),
    pass: String(process.env.SMTP_PASS || "").trim(),
    fromEmail: String(process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "").trim(),
    fromName: String(process.env.SMTP_FROM_NAME || "").trim()
  };
}

function ensureTransporter() {
  const config = getSmtpConfig();
  if (!config.host) {
    throw new Error("SMTP_HOST_NOT_CONFIGURED");
  }
  if (!config.port || Number.isNaN(config.port)) {
    throw new Error("SMTP_PORT_NOT_CONFIGURED");
  }
  if (!config.user) {
    throw new Error("SMTP_USER_NOT_CONFIGURED");
  }
  if (!config.pass) {
    throw new Error("SMTP_PASS_NOT_CONFIGURED");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass
      }
    });
  }

  return transporter;
}

function buildFrom() {
  const { fromEmail, fromName } = getSmtpConfig();
  if (!fromEmail) {
    throw new Error("SMTP_FROM_NOT_CONFIGURED");
  }
  if (fromName) {
    return {
      name: fromName,
      address: fromEmail
    };
  }
  return fromEmail;
}

function extractSmtpError(err) {
  if (err?.code) return String(err.code);
  if (err?.response) return String(err.response);
  if (err?.message) return String(err.message);
  return "SMTP_SEND_FAILED";
}

async function sendEmail({ to, subject, html, text }) {
  const smtpTransporter = ensureTransporter();
  const recipient = String(to || "").trim();
  if (!recipient) {
    throw new Error("SMTP_TO_REQUIRED");
  }

  try {
    await smtpTransporter.sendMail({
      from: buildFrom(),
      to: recipient,
      subject: String(subject || "").trim() || "Notificacion",
      html: html || "<p></p>",
      text: text || undefined
    });
  } catch (err) {
    const wrapped = new Error(extractSmtpError(err));
    wrapped.cause = err;
    throw wrapped;
  }
}

async function sendAlertEmail({ to, subject, html }) {
  try {
    const { fromEmail } = getSmtpConfig();
    await sendEmail({ to: to || fromEmail, subject, html });
  } catch (err) {
    console.error("No se pudo enviar alerta por correo", err);
  }
}

module.exports = { sendAlertEmail, sendEmail };
