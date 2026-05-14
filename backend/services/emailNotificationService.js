const { sendMail } = require("../config/mailer");

function sanitizeText(value, maxLen = 255) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLen);
}

function getFrontendBaseUrl() {
  return String(
    process.env.FRONTEND_BASE_URL ||
    process.env.APP_BASE_URL ||
    "http://localhost:4200"
  ).trim().replace(/\/+$/, "");
}

function buildReviewUrl() {
  return `${getFrontendBaseUrl()}/revision`;
}

function buildHomeUrl() {
  return `${getFrontendBaseUrl()}/`;
}

function buildSubmissionLabel(context = {}) {
  const code = sanitizeText(context.registro_codigo, 80);
  const unit = sanitizeText(context.unidad_clave, 40);
  const gestion = sanitizeText(context.gestion_nombre, 140);
  const owner = sanitizeText(context.nombre_propietario, 140);
  const idLabel = code || (context.id ? `ID ${context.id}` : "N/D");
  const pieces = [idLabel];

  if (unit) pieces.push(unit);
  if (gestion) pieces.push(gestion);
  if (owner) pieces.push(owner);

  return pieces.join(" | ");
}

async function safeSendMail({ to, subject, html, text }) {
  const recipient = sanitizeText(to, 320);
  if (!recipient) return false;

  try {
    await sendMail({ to: recipient, subject, html, text });
    return true;
  } catch (err) {
    console.error("No se pudo enviar correo transaccional", err);
    return false;
  }
}

async function notifyAssignee({ to, recipientName, roleLabel, actionLabel, context, comments }) {
  const safeName = sanitizeText(recipientName, 120) || "usuario";
  const safeRole = sanitizeText(roleLabel, 80) || "responsable";
  const safeAction = sanitizeText(actionLabel, 120) || "Tienes una nueva asignacion";
  const safeComments = sanitizeText(comments, 600);
  const reviewUrl = buildReviewUrl();
  const submissionLabel = buildSubmissionLabel(context);

  return safeSendMail({
    to,
    subject: `${safeAction}: ${context.registro_codigo || `ID ${context.id}`}`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #12324d; line-height: 1.6;">
        <h2 style="margin-bottom: 12px;">${safeAction}</h2>
        <p>Hola ${safeName},</p>
        <p>Se te asigno un proceso para continuar la gestion como ${safeRole}.</p>
        <p><strong>Tramite:</strong> ${submissionLabel}</p>
        ${safeComments ? `<p><strong>Comentarios:</strong> ${safeComments}</p>` : ""}
        <p>Ingresa al panel de revision para darle seguimiento:</p>
        <p><a href="${reviewUrl}" style="display:inline-block;padding:10px 16px;background:#0b8fd9;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700;">Abrir revision</a></p>
      </div>
    `,
    text:
      `${safeAction}\n\n` +
      `Hola ${safeName},\n` +
      `Se te asigno un proceso como ${safeRole}.\n` +
      `Tramite: ${submissionLabel}\n` +
      `${safeComments ? `Comentarios: ${safeComments}\n` : ""}` +
      `Revision: ${reviewUrl}\n`
  });
}

async function notifyUserStatus({ to, recipientName, subjectPrefix, heading, message, context, reason }) {
  const safeName = sanitizeText(recipientName, 120) || "usuario";
  const safeHeading = sanitizeText(heading, 120) || "Actualizacion de tramite";
  const safeMessage = sanitizeText(message, 400);
  const safeReason = sanitizeText(reason, 700);
  const homeUrl = buildHomeUrl();
  const submissionLabel = buildSubmissionLabel(context);

  return safeSendMail({
    to,
    subject: `${sanitizeText(subjectPrefix, 120) || "Actualizacion"}: ${context.registro_codigo || `ID ${context.id}`}`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #12324d; line-height: 1.6;">
        <h2 style="margin-bottom: 12px;">${safeHeading}</h2>
        <p>Hola ${safeName},</p>
        <p>${safeMessage}</p>
        <p><strong>Tramite:</strong> ${submissionLabel}</p>
        ${safeReason ? `<p><strong>Detalle:</strong> ${safeReason}</p>` : ""}
        <p>Puedes ingresar al sistema para revisar el estado actualizado:</p>
        <p><a href="${homeUrl}" style="display:inline-block;padding:10px 16px;background:#0b8fd9;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700;">Abrir portal</a></p>
      </div>
    `,
    text:
      `${safeHeading}\n\n` +
      `Hola ${safeName},\n` +
      `${safeMessage}\n` +
      `Tramite: ${submissionLabel}\n` +
      `${safeReason ? `Detalle: ${safeReason}\n` : ""}` +
      `Portal: ${homeUrl}\n`
  });
}

module.exports = {
  notifyAssignee,
  notifyUserStatus
};
