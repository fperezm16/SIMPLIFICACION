const { pool } = require("../src/db");
const {
  sanitizeGatewayMessage,
  buildAxiosErrorLog
} = require("./paymentHelpersService");

async function registerAdministrativePaymentAudit({
  payment,
  actorUserId,
  actorRole,
  reason,
  outcome,
  neoResponse,
  action = "cancel"
}) {
  if (!payment?.submission_id) return;

  const normalizedOutcome =
    String(outcome || "").trim().toLowerCase() === "success" ? "success" : "failed";

  const normalizedAction = String(action || "cancel").trim().toLowerCase() === "reverse"
    ? "reverse"
    : "cancel";

  const eventCodeMap = {
    cancel: {
      success: "payment_cancelled_admin",
      failed: "payment_cancel_failed_admin"
    },
    reverse: {
      success: "payment_reversed_admin",
      failed: "payment_reverse_failed_admin"
    }
  };

  const eventLabelMap = {
    cancel: {
      success: "Anulación administrativa de pago",
      failed: "Intento fallido de anulación administrativa"
    },
    reverse: {
      success: "Reversa administrativa de pago",
      failed: "Intento fallido de reversa administrativa"
    }
  };

  const eventCode = eventCodeMap[normalizedAction][normalizedOutcome];
  const eventLabel = eventLabelMap[normalizedAction][normalizedOutcome];

  const eventDetail = reason ? String(reason).trim().slice(0, 300) : null;

  const metadata = {
    action: normalizedAction,
    outcome: normalizedOutcome,
    payment_id: payment.id,
    payment_status_before: payment.status,
    reference_number: payment.reference_number || null,
    audit_number: payment.audit_number || null,
    systems_trace_no:
      neoResponse?.SystemsTraceNo ||
      payment.raw_response?.reversal_request?.payload?.SystemsTraceNo ||
      payment.audit_number ||
      null,
    response_code: neoResponse?.ResponseCode || null,
    response_message: sanitizeGatewayMessage(
      neoResponse?.PrivateUse63?.AlternateHostResponse22 || null
    )
  };

  try {
    await pool.query(
      `INSERT INTO payment_operation_logs (
         payment_id,
         submission_id,
         operation_type,
         outcome,
         event_label,
         reason,
         actor_user_id,
         actor_role,
         response_code,
         response_message,
         systems_trace_no,
         reference_number,
         metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        payment.id,
        payment.submission_id || null,
        normalizedAction,
        normalizedOutcome,
        eventLabel,
        eventDetail,
        actorUserId || null,
        actorRole ? String(actorRole).trim().toLowerCase().slice(0, 40) : null,
        metadata.response_code,
        metadata.response_message,
        metadata.systems_trace_no,
        metadata.reference_number,
        metadata
      ]
    );

    await pool.query(
      `INSERT INTO submission_logs (
         submission_id,
         event_code,
         event_label,
         event_detail,
         actor_user_id,
         actor_role,
         metadata
       )
       SELECT $1, $2, $3, $4, $5, $6, $7
       WHERE EXISTS (SELECT 1 FROM submissions WHERE id = $1)`,
      [
        payment.submission_id,
        eventCode,
        eventLabel,
        eventDetail,
        actorUserId || null,
        actorRole ? String(actorRole).trim().toLowerCase().slice(0, 40) : null,
        metadata
      ]
    );
  } catch (error) {
    console.error(
      "registerAdministrativePaymentAudit:",
      buildAxiosErrorLog(error, {
        service: "paymentAdminAuditService",
        phase: "payment_operation_logs.insert",
        paymentId: payment?.id,
        submissionId: payment?.submission_id
      })
    );
  }
}

async function registerAdministrativeCancellationAudit(args) {
  return registerAdministrativePaymentAudit({
    ...args,
    action: "cancel"
  });
}

async function registerAdministrativeReverseAudit(args) {
  return registerAdministrativePaymentAudit({
    ...args,
    action: "reverse"
  });
}

module.exports = {
  registerAdministrativePaymentAudit,
  registerAdministrativeCancellationAudit,
  registerAdministrativeReverseAudit
};
