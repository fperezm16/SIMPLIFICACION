const { pool } = require("../src/db");

async function getNextSystemsTraceNo() {
  const result = await pool.query(
    `UPDATE payment_trace_counter
     SET last_value = CASE WHEN last_value >= 999999 THEN 1 ELSE last_value + 1 END,
         updated_at = NOW()
     WHERE id = 1
     RETURNING last_value`
  );

  const numeric = Number(result.rows[0]?.last_value || 1);
  return String(numeric).padStart(6, "0");
}

async function getPaymentById(paymentId) {
  return (
    await pool.query(`SELECT * FROM payments WHERE id = $1`, [paymentId])
  ).rows[0];
}

async function getSubmissionPaymentData(submissionId) {
  return (
    await pool.query(
      `SELECT
         id,
         nombre_propietario,
         correo,
         telefono,
         direccion
       FROM submissions
       WHERE id = $1`,
      [submissionId]
    )
  ).rows[0];
}

async function insertPayment({
  submission_id,
  amount,
  paymentStatus,
  transactionId,
  neoResponse,
  rawResponse,
  payloadSystemsTraceNo,
  maskedCard,
  cardBrand,
  cardholderName
}) {
  return pool.query(
    `INSERT INTO payments (
      submission_id,
      amount,
      status,
      transaction_id,
      authorization_code,
      reference_number,
      audit_number,
      masked_card,
      response_code,
      raw_response,
      cardholder_name,
      card_brand
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *`,
    [
      submission_id,
      Number(amount),
      paymentStatus,
      transactionId,
      neoResponse.AuthIdResponse || null,
      neoResponse.RetrievalRefNo || null,
      neoResponse.SystemsTraceNo || payloadSystemsTraceNo,
      maskedCard,
      neoResponse.ResponseCode || null,
      rawResponse || neoResponse,
      cardholderName || null,
      cardBrand
    ]
  );
}

async function updatePaymentAfterGatewayStep(paymentId, {
  paymentStatus,
  transactionId,
  neoResponse,
  rawResponse,
  payloadSystemsTraceNo
}) {
  return pool.query(
    `UPDATE payments
     SET status = $1,
         transaction_id = COALESCE($2, transaction_id),
         authorization_code = COALESCE($3, authorization_code),
         reference_number = COALESCE($4, reference_number),
         audit_number = COALESCE($5, audit_number),
         response_code = $6,
         raw_response = $7,
         updated_at = NOW()
     WHERE id = $8
     RETURNING *`,
    [
      paymentStatus,
      transactionId || null,
      neoResponse?.AuthIdResponse || null,
      neoResponse?.RetrievalRefNo || null,
      neoResponse?.SystemsTraceNo || payloadSystemsTraceNo || null,
      neoResponse?.ResponseCode || null,
      rawResponse || neoResponse || null,
      paymentId
    ]
  );
}

async function markPaymentCancelled(paymentId, neoResponse) {
  return pool.query(
    `UPDATE payments
     SET status = 'cancelled',
         transaction_id = COALESCE($1, transaction_id),
         response_code = $2,
         raw_response = $3,
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [
      neoResponse.TransactionId || neoResponse.RetrievalRefNo || null,
      neoResponse.ResponseCode,
      neoResponse,
      paymentId
    ]
  );
}

async function markPaymentReversed(paymentId, neoResponse) {
  return pool.query(
    `UPDATE payments
     SET status = 'reversed',
         transaction_id = COALESCE($1, transaction_id),
         response_code = $2,
         raw_response = $3,
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [
      neoResponse.TransactionId || neoResponse.RetrievalRefNo || null,
      neoResponse.ResponseCode,
      neoResponse,
      paymentId
    ]
  );
}

module.exports = {
  getNextSystemsTraceNo,
  getPaymentById,
  getSubmissionPaymentData,
  insertPayment,
  updatePaymentAfterGatewayStep,
  markPaymentCancelled,
  markPaymentReversed
};
