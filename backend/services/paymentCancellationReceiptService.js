const PDFDocument = require("pdfkit");
const { pool } = require("../src/db");
const { sendMail } = require("../config/mailer");
const {
  drawVoucherLogos,
  drawVoucherHeaderBands
} = require("./paymentVoucherService");
const {
  formatVoucherDate,
  formatVoucherAmount,
  sanitizeGatewayMessage
} = require("./paymentHelpersService");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

function receiptError(message, statusCode = 400, code = "RECEIPT_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function cleanText(value, maxLength = 320) {
  return String(value || "").trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return cleanText(value, 1000)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildReceiptNumber(payment) {
  const year = new Date(payment.updated_at || Date.now()).getFullYear();
  return `ANU-${year}-${String(payment.id).padStart(6, "0")}`;
}

function buildProcedureLabel(snapshot) {
  const code = cleanText(snapshot.submission_code, 80);
  const name = cleanText(snapshot.procedure_name, 160);

  if (code && name) return `${code} - ${name}`;
  return code || name || "Tr\u00e1mite registrado";
}

function buildSnapshot(payment) {
  const cancellation = payment.raw_response?.cancellation || {};
  const cancellationRequest = cancellation.request || {};
  const cancellationResponse = cancellation.response || {};

  return {
    receipt_number: buildReceiptNumber(payment),
    payment_id: payment.id,
    submission_id: payment.submission_id,
    submission_code: payment.registro_codigo || null,
    procedure_name: payment.gestion_nombre || null,
    customer_name: payment.nombre_propietario || payment.cardholder_name || null,
    suggested_email: payment.correo || null,
    sale_date: payment.created_at,
    cancellation_date: payment.cancellation_created_at || payment.updated_at,
    amount: payment.amount,
    card_brand: payment.card_brand || null,
    masked_card: payment.masked_card || null,
    reference_number: payment.reference_number || null,
    authorization_code: payment.authorization_code || null,
    systems_trace_no:
      cancellationRequest.SystemsTraceNo || payment.audit_number || null,
    response_code: cancellationResponse.ResponseCode || payment.response_code || null,
    response_message: sanitizeGatewayMessage(
      cancellationResponse.PrivateUse63?.AlternateHostResponse22 ||
      payment.cancellation_response_message ||
      "APROBADA"
    ),
    reason: payment.cancellation_reason || null,
    cancelled_by: payment.cancelled_by || null,
    cancelled_by_role: payment.cancelled_by_role || null
  };
}

async function findReceipt(paymentId) {
  return (
    await pool.query(
      `SELECT
         pcr.*,
         COALESCE(reviewer.name, reviewer.email) AS reviewed_by,
         COALESCE(sender.name, sender.email) AS sent_by
       FROM payment_cancellation_receipts pcr
       LEFT JOIN users reviewer ON reviewer.id = pcr.reviewed_by_user_id
       LEFT JOIN users sender ON sender.id = pcr.sent_by_user_id
       WHERE pcr.payment_id = $1`,
      [paymentId]
    )
  ).rows[0] || null;
}

async function ensureCancellationReceipt(paymentId) {
  const existing = await findReceipt(paymentId);
  if (existing) return existing;

  const payment = (
    await pool.query(
      `SELECT
         p.*,
         s.registro_codigo,
         s.gestion_nombre,
         s.nombre_propietario,
         s.correo,
         cancel_log.reason AS cancellation_reason,
         cancel_log.response_message AS cancellation_response_message,
         cancel_log.created_at AS cancellation_created_at,
         COALESCE(cancel_user.name, cancel_user.email) AS cancelled_by,
         cancel_log.actor_role AS cancelled_by_role
       FROM payments p
       LEFT JOIN submissions s ON s.id = p.submission_id
       LEFT JOIN LATERAL (
         SELECT pol.*
         FROM payment_operation_logs pol
         WHERE pol.payment_id = p.id
           AND pol.operation_type = 'cancel'
           AND pol.outcome = 'success'
         ORDER BY pol.created_at DESC
         LIMIT 1
       ) cancel_log ON TRUE
       LEFT JOIN users cancel_user ON cancel_user.id = cancel_log.actor_user_id
       WHERE p.id = $1`,
      [paymentId]
    )
  ).rows[0];

  if (!payment) throw receiptError("Pago no encontrado", 404, "PAYMENT_NOT_FOUND");
  if (payment.status !== "cancelled") {
    throw receiptError("El comprobante solo existe para pagos anulados", 409, "PAYMENT_NOT_CANCELLED");
  }

  const snapshot = buildSnapshot(payment);
  if (String(snapshot.response_code || "").trim() !== "00") {
    throw receiptError("La anulacion no tiene una respuesta aprobada", 409, "CANCELLATION_NOT_APPROVED");
  }

  await pool.query(
    `INSERT INTO payment_cancellation_receipts (
       payment_id, receipt_number, snapshot
     )
     VALUES ($1, $2, $3)
     ON CONFLICT (payment_id) DO NOTHING`,
    [payment.id, snapshot.receipt_number, snapshot]
  );

  return findReceipt(paymentId);
}

function generateCancellationReceiptPdf(snapshot) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const buffers = [];
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    drawVoucherHeaderBands(doc);
    drawVoucherLogos(doc);
    doc.fillColor("#123b5d").fontSize(20)
      .text("Comprobante de anulacion de pago", 42, 126);
    doc.fillColor("#5b7485").fontSize(10)
      .text(snapshot.receipt_number, 42, 153);

    const rows = [
      ["Estado", "ANULADO"],
      ["Fecha de venta", formatVoucherDate(snapshot.sale_date)],
      ["Fecha de anulación", formatVoucherDate(snapshot.cancellation_date)],
      ["Trámite", buildProcedureLabel(snapshot)],
      ["Referencia", snapshot.reference_number || "N/D"],
      ["Número de autorización", snapshot.authorization_code || "N/D"],
      ["Número de operación", snapshot.systems_trace_no || "N/D"],
      ["Tarjeta", snapshot.masked_card || "N/D"],
      ["Marca", snapshot.card_brand || "N/D"]
    ];

    let y = 182;
    for (const [label, value] of rows) {
      doc.fillColor("#7a9198").fontSize(9).text(label, 48, y, { width: 165 });
      doc.fillColor("#173652").fontSize(10).text(String(value), 213, y, {
        width: 333,
        align: "right"
      });
      const rowHeight = Math.max(26, doc.heightOfString(String(value), { width: 333 }) + 12);
      doc.strokeColor("#d7e6e8").lineWidth(1)
        .moveTo(48, y + rowHeight - 5).lineTo(546, y + rowHeight - 5).stroke();
      y += rowHeight;
    }

    doc.roundedRect(42, y + 12, 510, 38, 8).fill("#eef6fd");
    doc.fillColor("#7a9198").fontSize(10).text("Monto anulado", 58, y + 25);
    doc.fillColor("#103351").fontSize(18)
      .text(formatVoucherAmount(snapshot.amount), 228, y + 20, { width: 290, align: "right" });
    doc.fillColor("#5b7485").fontSize(9)
      .text(
        "La liberación del cargo depende de los tiempos establecidos por el banco emisor.",
        48,
        y + 66,
        { width: 498 }
      );
    doc.end();
  });
}

async function reviewCancellationReceipt(paymentId, actor) {
  await ensureCancellationReceipt(paymentId);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE payment_cancellation_receipts
       SET review_status = 'reviewed',
           reviewed_by_user_id = COALESCE(reviewed_by_user_id, $2),
           reviewed_at = COALESCE(reviewed_at, NOW()),
           updated_at = NOW()
       WHERE payment_id = $1
       RETURNING *`,
      [paymentId, actor?.sub || null]
    );

    await client.query(
      `INSERT INTO payment_operation_logs (
         payment_id, submission_id, operation_type, outcome, event_label,
         actor_user_id, actor_role, metadata
       )
       SELECT p.id, p.submission_id, 'receipt_review', 'success',
              'Comprobante de anulacion revisado', $2::INTEGER, $3::TEXT,
              jsonb_build_object('payment_id', p.id, 'receipt_number', $4::TEXT)
       FROM payments p WHERE p.id = $1`,
      [
        paymentId,
        actor?.sub || null,
        cleanText(actor?.role, 40) || null,
        result.rows[0]?.receipt_number || null
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return findReceipt(paymentId);
}

async function sendCancellationReceipt(paymentId, recipientEmail, actor) {
  const receipt = await ensureCancellationReceipt(paymentId);
  if (receipt.review_status !== "reviewed" || !receipt.reviewed_at) {
    throw receiptError(
      "Debe revisar y confirmar el comprobante antes de enviarlo por correo",
      409,
      "RECEIPT_REVIEW_REQUIRED"
    );
  }

  const email = cleanText(recipientEmail, 320).toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    throw receiptError("Ingrese un correo electronico valido", 400, "INVALID_EMAIL");
  }

  const pdfBuffer = await generateCancellationReceiptPdf(receipt.snapshot);
  const filename = `comprobante-anulacion-${receipt.receipt_number}.pdf`;

  try {
    await sendMail({
      to: email,
      subject: `Comprobante de anulacion ${receipt.receipt_number}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#12324d;line-height:1.6">
        <h2>Comprobante de anulacion de pago</h2>
        <p>Se adjunta el comprobante de anulacion ${escapeHtml(receipt.receipt_number)}.</p>
        <p><strong>Tr&aacute;mite:</strong> ${escapeHtml(buildProcedureLabel(receipt.snapshot))}</p>
        <p><strong>Monto anulado:</strong> ${escapeHtml(formatVoucherAmount(receipt.snapshot.amount))}</p>
        <p><strong>Referencia:</strong> ${escapeHtml(receipt.snapshot.reference_number || "N/D")}</p>
        <p>La liberación del cargo depende de los tiempos establecidos por el banco emisor.</p>
      </div>`,
      text:
        `Comprobante de anulacion ${receipt.receipt_number}\n` +
        `Tr\u00e1mite: ${buildProcedureLabel(receipt.snapshot)}\n` +
        `Monto: ${formatVoucherAmount(receipt.snapshot.amount)}\n` +
        `Referencia: ${receipt.snapshot.reference_number || "N/D"}\n`,
      attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }]
    });

    await pool.query(
      `UPDATE payment_cancellation_receipts
       SET send_status = 'sent', sent_to = $2, sent_by_user_id = $3,
           sent_at = NOW(), send_error = NULL, updated_at = NOW()
       WHERE payment_id = $1`,
      [paymentId, email, actor?.sub || null]
    );
    await recordEmailAttempt(paymentId, email, actor, "success", null);
  } catch (error) {
    const safeError = cleanText(error?.message || "SMTP_SEND_FAILED", 300);
    await pool.query(
      `UPDATE payment_cancellation_receipts
       SET send_status = 'error', sent_to = $2, sent_by_user_id = $3,
           send_error = $4, updated_at = NOW()
       WHERE payment_id = $1`,
      [paymentId, email, actor?.sub || null, safeError]
    );
    await recordEmailAttempt(paymentId, email, actor, "failed", safeError);
    throw receiptError("No se pudo enviar el comprobante por correo", 502, "EMAIL_SEND_FAILED");
  }

  return findReceipt(paymentId);
}

async function recordEmailAttempt(paymentId, email, actor, outcome, errorMessage) {
  await pool.query(
    `INSERT INTO payment_operation_logs (
       payment_id, submission_id, operation_type, outcome, event_label,
       reason, actor_user_id, actor_role, metadata
     )
     SELECT p.id, p.submission_id, 'receipt_email', $2::TEXT,
            CASE WHEN $2::TEXT = 'success'
              THEN 'Comprobante de anulacion enviado'
              ELSE 'Error enviando comprobante de anulacion'
            END,
            $3::TEXT, $4::INTEGER, $5::TEXT,
            jsonb_build_object('payment_id', p.id, 'recipient', $6::TEXT)
     FROM payments p WHERE p.id = $1`,
    [
      paymentId,
      outcome,
      errorMessage,
      actor?.sub || null,
      cleanText(actor?.role, 40) || null,
      email
    ]
  );
}

module.exports = {
  buildSnapshot,
  ensureCancellationReceipt,
  generateCancellationReceiptPdf,
  reviewCancellationReceipt,
  sendCancellationReceipt
};
