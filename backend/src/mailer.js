const sgMail = require("@sendgrid/mail");

let sendgridInitialized = false;

function getSendgridConfig() {
  const apiKey = String(process.env.SENDGRID_API_KEY || "").trim();
  const fromEmail = String(process.env.SENDGRID_FROM_EMAIL || "").trim();
  const fromName = String(process.env.SENDGRID_FROM_NAME || "").trim();
  return { apiKey, fromEmail, fromName };
}

function ensureSendgridClient() {
  const { apiKey } = getSendgridConfig();
  if (!apiKey) {
    throw new Error("SENDGRID_NOT_CONFIGURED");
  }
  if (!sendgridInitialized) {
    sgMail.setApiKey(apiKey);
    sendgridInitialized = true;
  }
}

function buildFrom() {
  const { fromEmail, fromName } = getSendgridConfig();
  if (!fromEmail) {
    throw new Error("SENDGRID_FROM_NOT_CONFIGURED");
  }
  if (fromName) {
    return { email: fromEmail, name: fromName };
  }
  return fromEmail;
}

function extractSendgridError(err) {
  const first = err?.response?.body?.errors?.[0];
  if (first?.message) return String(first.message);
  if (err?.message) return String(err.message);
  return "SENDGRID_SEND_FAILED";
}

async function sendEmail({ to, subject, html, text }) {
  ensureSendgridClient();
  const from = buildFrom();
  const recipient = String(to || "").trim();
  if (!recipient) {
    throw new Error("SENDGRID_TO_REQUIRED");
  }

  const msg = {
    to: recipient,
    from,
    subject: String(subject || "").trim() || "Notificacion",
    html: html || "<p></p>",
    text: text || undefined
  };

  try {
    await sgMail.send(msg);
  } catch (err) {
    const reason = extractSendgridError(err);
    const wrapped = new Error(reason);
    wrapped.cause = err;
    throw wrapped;
  }
}

async function sendAlertEmail({ to, subject, html }) {
  try {
    const { fromEmail } = getSendgridConfig();
    await sendEmail({ to: to || fromEmail, subject, html });
  } catch (err) {
    console.error("No se pudo enviar alerta por correo", err);
  }
}

module.exports = { sendAlertEmail, sendEmail };