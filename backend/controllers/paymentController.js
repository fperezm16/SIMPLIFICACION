const neonetService = require("../services/neonetService");
const { pool } = require("../src/db");
const {
  sanitizeHeaderFilename,
  shouldUseMock,
  isApproved,
  getPaymentMessage,
  getShopperIp,
  getBrowserThreeDSData,
  buildAxiosErrorLog,
  sanitizeNeoResponseForClient,
  sanitizePaymentForClient
} = require("../services/paymentHelpersService");
const {
  buildVoucherData: buildVoucherDataFromService,
  generateVoucherPdfBuffer: generateVoucherPdfBufferFromService
} = require("../services/paymentVoucherService");
const paymentOrchestrator = require("../services/paymentOrchestrator");
const { summarizeReturnFields } = require("../services/paymentReturnDiagnostics");
const { resolveThreeDSReturnUrl } = require("../services/paymentThreeDSService");
const {
  dispatchPayment,
  mapGatewayError,
  buildReversePayloadFromOriginal
} = require("../services/paymentGatewayService");
const {
  getNextSystemsTraceNo,
  getPaymentById,
  markPaymentCancelled,
  markPaymentReversed
} = require("../services/paymentPersistenceService");
const { buildBasePayload } = require("../services/paymentPayloadService");
const {
  registerAdministrativeCancellationAudit,
  registerAdministrativeReverseAudit
} = require("../services/paymentAdminAuditService");

exports.getPaymentHealth = async (_req, res) => {
  const diagnostics = neonetService.getConfigDiagnostics();

  return res.json({
    ok: diagnostics.ok,
    mode: shouldUseMock() ? "mock" : "gateway",
    gateway: "NeoNet",
    endpoint: diagnostics.endpoint,
    checks: diagnostics.checks
  });
};

exports.createPayment = async (req, res) => {
  const browserData = {
    ...getBrowserThreeDSData(req),
    ...(req.body?.browserData || {})
  };

  const result = await paymentOrchestrator.createPayment(req.body || {}, {
    shopperIP: getShopperIp(req),
    browserData
  });

  return res.status(result.statusCode).json(result.body);
};

exports.continuePayment = async (req, res) => {
  const browserData = {
    ...getBrowserThreeDSData(req),
    ...(req.body?.browserData || {})
  };

  const result = await paymentOrchestrator.continuePayment(req.params.id, req.body || {}, {
    shopperIP: getShopperIp(req),
    browserData
  });

  return res.status(result.statusCode).json(result.body);
};

exports.renderThreeDSReturnPage = async (req, res) => {
  if (String(process.env.NEOPAY_3DS_DEBUG || "").trim().toLowerCase() === "true") {
    console.log("[3DS TRACE] stepUp.return", JSON.stringify({
      received_at: new Date().toISOString(),
      method: req.method,
      body: summarizeReturnFields(req.body),
      query: summarizeReturnFields(req.query),
      diagnostic_only: true,
      callback_signature_verified_by_app: false
    }, null, 2));
  }
  const frontendOrigin = process.env.FRONTEND_BASE_URL || "*";
  const returnUrl = resolveThreeDSReturnUrl();
  const payload = {
    query: req.query || {},
    body: req.body || {},
    method: req.method,
    return_url: returnUrl
  };
  const serializedPayload = JSON.stringify(payload).replace(/</g, "\\u003c");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(`<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>3DS Return</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script>
      (function () {
        var payload = ${serializedPayload};
        var message = {
          type: "payment_3ds_step_up_complete",
          payload: payload
        };
        var targetOrigin = ${JSON.stringify(frontendOrigin)};
        function notify(target) {
          if (!target || target === window) return;
          target.postMessage(message, targetOrigin);
        }

        if (window.parent && window.parent !== window) {
          notify(window.parent);
        }
        if (window.opener && window.opener !== window.parent) {
          notify(window.opener);
        }
      })();
    </script>
    <p>Autenticación 3DS completada. Puede cerrar esta ventana.</p>
  </body>
</html>`);
};


exports.cancelPayment = async (req, res) => {
  let payment = null;
  try {
    const reason = String(req.body?.reason || "").trim();

    if (!reason) {
      return res.status(400).json({
        ok: false,
        message: "Debe ingresar un motivo de anulacion"
      });
    }

    payment = await getPaymentById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        ok: false,
        message: "Pago no encontrado"
      });
    }

    if (payment.status === "cancelled") {
      return res.status(400).json({
        ok: false,
        message: "El pago ya fue anulado"
      });
    }

    if (payment.status !== "approved") {
      return res.status(400).json({
        ok: false,
        message: "Solo se pueden anular pagos aprobados"
      });
    }

    const payload = buildBasePayload();
    payload.MessageTypeId = "0200";
    payload.ProcessingCode = "020000";
    payload.SystemsTraceNo = await getNextSystemsTraceNo();
    payload.PrivateUse63.HostReferenceData31 = payment.reference_number || "";

    const shopperIP = getShopperIp(req);
    const neoResponse = await dispatchPayment(payload, shopperIP);

    if (!isApproved(neoResponse.ResponseCode)) {
      await registerAdministrativeCancellationAudit({
        payment,
        actorUserId: req.user?.sub,
        actorRole: req.user?.role,
        reason,
        outcome: "failed",
        neoResponse
      });
      return res.status(400).json({
        ok: false,
        message: "Anulación rechazada",
        neo_response: neoResponse
      });
    }

    const updated = await markPaymentCancelled(req.params.id, neoResponse);

    await registerAdministrativeCancellationAudit({
      payment,
      actorUserId: req.user?.sub,
      actorRole: req.user?.role,
      reason,
      outcome: "success",
      neoResponse
    });

    return res.json({
      ok: true,
      status: "cancelled",
      message: getPaymentMessage("cancelled"),
      payment: sanitizePaymentForClient(updated.rows[0]),
      neo_response: sanitizeNeoResponseForClient(neoResponse)
  
  });
  } catch (error) {
    const gatewayError = mapGatewayError(error);
    console.error(
      "cancelPayment:",
      buildAxiosErrorLog(error, {
        service: "paymentController",
        phase: "cancelPayment",
        paymentId: Number(req.params.id),
        submissionId: payment?.submission_id || null
      })
    );
    return res.status(gatewayError.statusCode).json({
      ok: false,
      message: gatewayError.message || "Error anulando pago",
      detail: gatewayError.detail
    });
  }
};


exports.reversePayment = async (req, res) => {
  let payment = null;
  try {
    const reason = String(req.body?.reason || "").trim();

    if (!reason) {
      return res.status(400).json({
        ok: false,
        message: "Debe ingresar un motivo de reversa"
      });
    }

    payment = await getPaymentById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        ok: false,
        message: "Pago no encontrado"
      });
    }

    if (payment.status !== "approved" && payment.status !== "timeout") {
      return res.status(400).json({
        ok: false,
        message: "Solo se pueden reversar pagos aprobados o en timeout"
      });
    }

    const threeDS = payment.raw_response?.threeDS || {};
    const reversalStep = String(threeDS.step || "").trim();
    const referenceId = String(threeDS.referenceId || "").trim();
    const storedReversalRequest = payment.raw_response?.reversal_request;
    const originalPayload = storedReversalRequest?.payload;

    if (
      payment.raw_response?.flow !== "3ds" ||
      !["3", "5"].includes(reversalStep) ||
      !referenceId ||
      !payment.audit_number ||
      storedReversalRequest?.step !== `step${reversalStep}` ||
      !originalPayload
    ) {
      return res.status(400).json({
        ok: false,
        message: "El pago no conserva el request 3DS original requerido para una reversa controlada"
      });
    }

    const payload = buildReversePayloadFromOriginal(originalPayload);

    const shopperIP = getShopperIp(req);
    const neoResponse = await dispatchPayment(payload, shopperIP);

    if (!isApproved(neoResponse.ResponseCode)) {
      await registerAdministrativeReverseAudit({
        payment,
        actorUserId: req.user?.sub,
        actorRole: req.user?.role,
        reason,
        outcome: "failed",
        neoResponse
      });
      return res.status(400).json({
        ok: false,
        message: "Reversa rechazada",
        neo_response: sanitizeNeoResponseForClient(neoResponse)
      });
    }

    const updated = await markPaymentReversed(req.params.id, neoResponse);

    await registerAdministrativeReverseAudit({
      payment,
      actorUserId: req.user?.sub,
      actorRole: req.user?.role,
      reason,
      outcome: "success",
      neoResponse
    });

    return res.json({
      ok: true,
      status: "reversed",
      message: getPaymentMessage("reversed"),
      payment: sanitizePaymentForClient(updated.rows[0]),
      neo_response: sanitizeNeoResponseForClient(neoResponse)
    });
   } catch (error) {
    const gatewayError = mapGatewayError(error);
    console.error(
      "reversePayment:",
      buildAxiosErrorLog(error, {
        service: "paymentController",
        phase: "reversePayment",
        paymentId: Number(req.params.id),
        submissionId: payment?.submission_id || null
      })
    );
    return res.status(gatewayError.statusCode).json({
      ok: false,
      message: gatewayError.message || "Error ejecutando reversa",
      detail: gatewayError.detail
    });
  }
};

exports.listReversalPayments = async (req, res) => {
  try {
    const query = String(req.query?.q || "").trim().slice(0, 120);
    const status = String(req.query?.status || "").trim().toLowerCase();
    const selectedStatus = ["approved", "timeout", "reversed"].includes(status)
      ? status
      : "";
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 200);
    const params = [];
    const where = ["p.status IN ('approved', 'timeout', 'reversed')"];

    if (selectedStatus) {
      params.push(selectedStatus);
      where.push(`p.status = $${params.length}`);
    }
    if (query) {
      params.push(`%${query}%`);
      where.push(`(
        CAST(p.id AS TEXT) ILIKE $${params.length}
        OR COALESCE(s.registro_codigo, '') ILIKE $${params.length}
        OR COALESCE(s.nombre_propietario, '') ILIKE $${params.length}
        OR COALESCE(p.reference_number, '') ILIKE $${params.length}
      )`);
    }
    params.push(limit);

    const result = await pool.query(
      `SELECT
         p.id,
         p.submission_id,
         p.amount,
         p.status,
         p.transaction_id,
         p.authorization_code,
         p.reference_number,
         p.audit_number,
         p.masked_card,
         p.card_brand,
         p.cardholder_name,
         p.response_code,
         p.created_at,
         p.updated_at,
         s.registro_codigo,
         s.gestion_nombre,
         s.unidad_clave,
         s.nombre_propietario,
         CASE
           WHEN p.status IN ('approved', 'timeout')
             AND p.raw_response->>'flow' = '3ds'
             AND COALESCE(p.raw_response->'threeDS'->>'referenceId', '') <> ''
             AND COALESCE(p.audit_number, '') <> ''
             AND COALESCE(p.raw_response->'reversal_request'->>'step', '')
                 = CONCAT('step', p.raw_response->'threeDS'->>'step')
             AND p.raw_response->'reversal_request'->'payload' IS NOT NULL
           THEN TRUE
           ELSE FALSE
         END AS can_reverse
       FROM payments p
       LEFT JOIN submissions s ON s.id = p.submission_id
       WHERE ${where.join(" AND ")}
       ORDER BY p.updated_at DESC
       LIMIT $${params.length}`,
      params
    );

    return res.json({ ok: true, payments: result.rows });
  } catch (error) {
    console.error("listReversalPayments:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar la gestion de reversas" });
  }
};

exports.getReversalHistory = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT event_code, event_label, event_detail, actor_role, created_at, metadata
       FROM submission_logs
       WHERE submission_id = (SELECT submission_id FROM payments WHERE id = $1)
         AND metadata->>'payment_id' = $1
         AND event_code IN ('payment_reversed_admin', 'payment_reverse_failed_admin')
       ORDER BY created_at DESC`,
      [String(req.params.id)]
    );
    return res.json({ ok: true, history: result.rows });
  } catch (error) {
    console.error("getReversalHistory:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar el historial de reversas" });
  }
};


exports.getVoucher = async (req, res) => {
  try {
    const payment = await getPaymentById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        ok: false,
        message: "Pago no encontrado"
      });
    }

    return res.json({
      ok: true,
      voucher: buildVoucherDataFromService(payment)
    });
  } catch (error) {
    console.error(
      "getVoucher:",
      buildAxiosErrorLog(error, {
        service: "paymentController",
        phase: "getVoucher",
        paymentId: Number(req.params.id)
      })
    );
    return res.status(500).json({
      ok: false,
      message: "Error obteniendo voucher"
    });
  }
};

exports.downloadVoucherPdf = async (req, res) => {
  try {
    const payment = await getPaymentById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        ok: false,
        message: "Pago no encontrado"
      });
    }

    const pdfBuffer = await generateVoucherPdfBufferFromService(payment);
    const filename = sanitizeHeaderFilename(
      `voucher-pago-${payment.id}.pdf`,
      "voucher-pago.pdf"
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error(
      "downloadVoucherPdf:",
      buildAxiosErrorLog(error, {
        service: "paymentController",
        phase: "downloadVoucherPdf",
        paymentId: Number(req.params.id)
      })
    );
    return res.status(500).json({
      ok: false,
      message: "Error generando voucher PDF"
    });
  }
};
