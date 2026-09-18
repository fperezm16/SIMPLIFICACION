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
    payment_id: payment.id,
    payment_status_before: payment.status,
    reference_number: payment.reference_number || null,
    audit_number: payment.audit_number || null,
    response_code: neoResponse?.ResponseCode || null,
    response_message: sanitizeGatewayMessage(
      neoResponse?.PrivateUse63?.AlternateHostResponse22 || null
    )
  };

  try {
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
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
        phase: "submission_logs.insert",
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
