function sanitizeText(value, maxLen = 255) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLen);
}

function sanitizeHeaderFilename(value, fallback = "voucher.pdf") {
  const raw = String(value || fallback).trim() || fallback;
  const cleaned = raw.replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-");
  return cleaned || fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function shouldUseMock() {
  return normalizeBoolean(process.env.NEOPAY_USE_MOCK, false);
}

function formatAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Monto invalido");
  }
  return String(Math.round(numeric * 100));
}

function normalizeExpirationDate(expiration) {
  const digits = String(expiration || "").replace(/\D/g, "");
  if (!/^\d{4}$/.test(digits)) return null;

  const firstPair = Number(digits.slice(0, 2));
  const lastPair = Number(digits.slice(2, 4));
  const firstLooksLikeMonth = Number.isInteger(firstPair) && firstPair >= 1 && firstPair <= 12;
  const lastLooksLikeMonth = Number.isInteger(lastPair) && lastPair >= 1 && lastPair <= 12;

  if (firstLooksLikeMonth && !lastLooksLikeMonth) {
    return `${digits.slice(2, 4)}${digits.slice(0, 2)}`;
  }

  if (!firstLooksLikeMonth && lastLooksLikeMonth) {
    return digits;
  }

  if (firstLooksLikeMonth && lastLooksLikeMonth) {
    return `${digits.slice(2, 4)}${digits.slice(0, 2)}`;
  }

  return null;
}

function getCardType(cardNumber) {
  if (/^4/.test(cardNumber)) return "001";
  if (/^(5[1-5]|2[2-7])/.test(cardNumber)) return "002";
  return "";
}

function getCardBrandLabel(cardNumber) {
  if (/^4/.test(cardNumber)) return "VISA";
  if (/^(5[1-5]|2[2-7])/.test(cardNumber)) return "MASTERCARD";
  return "DESCONOCIDA";
}

function maskCardNumber(cardNumber) {
  const digits = String(cardNumber || "").replace(/\D/g, "");
  if (digits.length < 4) return "****";
  const last4 = digits.slice(-4);
  return `**** **** **** ${last4}`;
}

function getLocalTransactionTime() {
  return new Date().toTimeString().slice(0, 8).replace(/:/g, "");
}

function getLocalTransactionDate() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function isApproved(code) {
  return code === "00" || code === "10";
}

function isPartialApproval(code) {
  return String(code || "").trim() === "10";
}

function isTimeoutResponseCode(code) {
  return String(code || "").trim() === "91";
}

function hasUsableResponseCode(code) {
  return String(code || "").trim() !== "";
}

function isRejectedResponseCode(code) {
  return hasUsableResponseCode(code) && !isApproved(code) && !isTimeoutResponseCode(code);
}

function getPaymentStatus(code) {
  if (code === "00") return "approved";
  if (code === "10") return "partial_approved";
  if (code === "91") return "timeout";
  return "rejected";
}

function getPaymentMessage(status) {
  if (status === "approved") return "Pago aprobado correctamente";
  if (status === "partial_approved") return "La transaccion fue autorizada parcialmente.";
  if (status === "timeout") return "La transacción excedio el tiempo de espera.";
  if (status === "pending_3ds") return "Se requiere verificación 3DS para continuar.";
  if (status === "challenge_required") return "Se requiere autenticación adicional del emisor.";
  if (status === "reversed") return "Pago reversado correctamente";
  if (status === "cancelled") return "Pago anulado correctamente";
  return "Pago rechazado";
}

function formatVoucherDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "N/D";
  return new Intl.DateTimeFormat("es-GT", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatVoucherAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Q 0.00";
  return `Q ${numeric.toFixed(2)}`;
}

function extractNameParts(cardholderName) {
  const safeName = sanitizeText(cardholderName, 80);
  const parts = safeName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || ""
  };
}

function normalizeShopperIp(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "::1") return "127.0.0.1";

  // Algunos proxies representan IPv4 como una direccion IPv6 mapeada.
  const mappedIpv4 = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  return mappedIpv4 ? mappedIpv4[1] : raw;
}

function getShopperIp(req = {}) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded.length) {
    return normalizeShopperIp(forwarded[0]);
  }
  if (typeof forwarded === "string" && forwarded.trim()) {
    return normalizeShopperIp(forwarded.split(",")[0]);
  }
  return normalizeShopperIp(req.ip);
}

function getBrowserThreeDSData(req) {
  const acceptLanguage = req?.headers?.["accept-language"];
  const acceptHeader = req?.headers?.accept;
  const userAgent = req?.headers?.["user-agent"];

  const browserLanguage = Array.isArray(acceptLanguage)
    ? String(acceptLanguage[0] || "").split(",")[0].trim()
    : String(acceptLanguage || "").split(",")[0].trim();

  return {
    browserLanguage: browserLanguage || "es-GT",
    browserAcceptHeader: Array.isArray(acceptHeader)
      ? String(acceptHeader[0] || "").trim()
      : String(acceptHeader || "*/*").trim() || "*/*",
    browserUserAgent: Array.isArray(userAgent)
      ? String(userAgent[0] || "").trim()
      : String(userAgent || "").trim(),
    browserScreenWidth: "1366",
    browserScreenHeight: "768",
    browserColorDepth: "24",
    browserJavaEnabled: "false",
    browserTZ: String(new Date().getTimezoneOffset())
  };
}

const REDACTED_VALUE = "[REDACTED]";

function normalizeSensitiveKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function maskPanForLog(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 10) return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
  return `${digits.slice(0, 6)}${"*".repeat(Math.max(0, digits.length - 10))}${digits.slice(-4)}`;
}

function maskReferenceIdForLog(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= 12) return `${raw.slice(0, 4)}***${raw.slice(-2)}`;
  return `${raw.slice(0, 8)}...${raw.slice(-4)}`;
}

function maskEmailForLog(value) {
  const raw = String(value || "").trim();
  if (!raw.includes("@")) return raw ? REDACTED_VALUE : "";
  const [localPart, domain] = raw.split("@");
  const safeLocal =
    localPart.length <= 2
      ? `${localPart.slice(0, 1)}***`
      : `${localPart.slice(0, 2)}***`;
  return `${safeLocal}@${domain}`;
}

function maskPhoneForLog(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return `${"*".repeat(Math.max(0, digits.length - 1))}${digits.slice(-1)}`;
  return `${"*".repeat(digits.length - 2)}${digits.slice(-2)}`;
}

function cloneAndSanitizeForLog(value, path = [], seen = new WeakMap()) {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    if (seen.has(value)) return seen.get(value);
    const next = [];
    seen.set(value, next);
    for (const item of value) {
      next.push(cloneAndSanitizeForLog(item, path, seen));
    }
    return next;
  }

  if (typeof value === "object") {
    if (seen.has(value)) return seen.get(value);
    const next = {};
    seen.set(value, next);

    for (const [key, nestedValue] of Object.entries(value)) {
      const normalizedKey = normalizeSensitiveKey(key);

      if (normalizedKey === "reversalrequest") {
        continue;
      }
      const nestedPath = [...path, normalizedKey];

      if (
        normalizedKey.includes("cvv") ||
        normalizedKey.includes("merchantpasswd") ||
        normalizedKey.includes("merchantuser") ||
        normalizedKey.includes("password") ||
        normalizedKey.includes("authorization") ||
        normalizedKey === "cookie" ||
        normalizedKey === "setcookie" ||
        normalizedKey.includes("accesstoken") ||
        normalizedKey.includes("secret") ||
        normalizedKey === "jwt"
      ) {
        next[key] = REDACTED_VALUE;
        continue;
      }

      if (normalizedKey === "primaryacctnum" || normalizedKey === "pan") {
        next[key] = maskPanForLog(nestedValue);
        continue;Ñ
      }

      if (normalizedKey === "referenceid") {
        next[key] = maskReferenceIdForLog(nestedValue);
        continue;
      }

      if (normalizedKey === "email") {
        next[key] = maskEmailForLog(nestedValue);
        continue;
      }

      if (normalizedKey === "phonenumber" || normalizedKey === "phone") {
        next[key] = maskPhoneForLog(nestedValue);
        continue;
      }

      next[key] = cloneAndSanitizeForLog(nestedValue, nestedPath, seen);
    }

    return next;
  }

  return value;
}

function sanitizeForLog(value) {
  return cloneAndSanitizeForLog(value);
}

function cloneAndSanitizeForClient(value, seen = new WeakMap()) {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    if (seen.has(value)) return seen.get(value);
    const next = [];
    seen.set(value, next);
    for (const item of value) {
      next.push(cloneAndSanitizeForClient(item, seen));
    }
    return next;
  }

  if (typeof value === "object") {
    if (seen.has(value)) return seen.get(value);
    const next = {};
    seen.set(value, next);

    for (const [key, nestedValue] of Object.entries(value)) {
      const normalizedKey = normalizeSensitiveKey(key);

      if (
        normalizedKey.includes("cvv") ||
        normalizedKey.includes("merchantpasswd") ||
        normalizedKey.includes("merchantuser") ||
        normalizedKey.includes("password") ||
        (normalizedKey.includes("authorization") && normalizedKey !== "authorizationcode") ||
        normalizedKey === "cookie" ||
        normalizedKey === "setcookie" ||
        normalizedKey.includes("accesstoken") ||
        normalizedKey === "jwt"
      ) {
        continue;
      }

      if (normalizedKey === "primaryacctnum" || normalizedKey === "pan") {
        next[key] = maskCardNumber(nestedValue);
        continue;
      }

      if (normalizedKey === "referenceid") {
        next[key] = maskReferenceIdForLog(nestedValue);
        continue;
      }

      next[key] = cloneAndSanitizeForClient(nestedValue, seen);
    }

    return next;
  }

  return value;
}

function sanitizeNeoResponseForClient(neoResponse) {
  return cloneAndSanitizeForClient(neoResponse);
}

function sanitizePaymentForClient(payment) {
  if (!payment || typeof payment !== "object") {
    return payment;
  }

  const safePayment = cloneAndSanitizeForClient(payment);
  if (safePayment && typeof safePayment === "object" && "raw_response" in safePayment) {
    safePayment.raw_response = cloneAndSanitizeForClient(safePayment.raw_response);
  }
  return safePayment;
}

function sanitizeUrlForLog(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const queryIndex = raw.indexOf("?");
  return queryIndex === -1 ? raw : raw.slice(0, queryIndex);
}

function sanitizeGatewayMessage(value, maxLen = 300) {
  return sanitizeText(value || "", maxLen) || null;
}

function buildAxiosErrorLog(error, context = {}) {
  const gatewayData = error?.response?.data || error?.data || {};
  const payerAuthentication = gatewayData?.PayerAuthentication || {};

  return sanitizeForLog({
    service: context.service || null,
    phase: context.phase || null,
    payment_id: context.paymentId ?? null,
    submission_id: context.submissionId ?? null,
    name: error?.name || "Error",
    code: error?.code || error?.type || null,
    type: error?.type || null,
    message: error?.message || null,
    http_status: error?.response?.status || error?.status || null,
    method: String(error?.config?.method || context.method || "").toUpperCase() || null,
    url: sanitizeUrlForLog(error?.config?.url || context.url || null),
    has_request: Boolean(error?.request),
    has_response: Boolean(error?.response),
    response_code: gatewayData?.ResponseCode || null,
    systems_trace_no: gatewayData?.SystemsTraceNo || context.systemsTraceNo || null,
    step: String(payerAuthentication?.Step || context.step || "").trim() || null,
    reference_id: payerAuthentication?.ReferenceId || context.referenceId || null,
    alternate_host_response: sanitizeGatewayMessage(
      gatewayData?.PrivateUse63?.AlternateHostResponse22 || context.gatewayMessage || null
    )
  });
}

function buildPaymentLogSummary(context = {}) {
  return sanitizeForLog({
    service: context.service || null,
    phase: context.phase || null,
    payment_id: context.paymentId ?? null,
    submission_id: context.submissionId ?? null,
    step: context.step ?? null,
    response_code: context.responseCode ?? null,
    systems_trace_no: context.systemsTraceNo ?? null,
    reference_id: context.referenceId ?? null,
    duration_ms: context.durationMs ?? null,
    http_status: context.httpStatus ?? null,
    method: context.method ?? null,
    gateway_message: sanitizeGatewayMessage(context.gatewayMessage || null),
    error_type: context.errorType ?? null,
    status: context.status ?? null
  });
}

function buildThreeDSEvaluationLogSummary(context = {}) {
  return sanitizeForLog({
    service: context.service || null,
    phase: context.phase || null,
    payment_id: context.paymentId ?? null,
    submission_id: context.submissionId ?? null,
    requested_step: context.requestedStep ?? null,
    response_step: context.responseStep ?? null,
    response_code: context.responseCode ?? null,
    status: context.status ?? null,
    reason: context.reason ?? null,
    reference_id: context.referenceId ?? null,
    has_reference_id: Boolean(context.hasReferenceId),
    has_access_token: Boolean(context.hasAccessToken),
    has_device_data_collection_url: Boolean(context.hasDeviceDataCollectionUrl),
    is_final: Boolean(context.isFinal)
  });
}

function buildGatewayFailureLogSummary(context = {}) {
  return sanitizeForLog({
    service: context.service || null,
    phase: context.phase || null,
    payment_id: context.paymentId ?? null,
    submission_id: context.submissionId ?? null,
    flow: context.flow ?? null,
    requested_step: context.requestedStep ?? null,
    error_category: context.errorCategory ?? null,
    error_code: context.errorCode ?? null,
    http_status: context.httpStatus ?? null,
    had_request: Boolean(context.hadRequest),
    had_response: Boolean(context.hadResponse),
    request_may_have_reached_gateway: Boolean(context.requestMayHaveReachedGateway),
    should_attempt_automatic_reversal: Boolean(context.shouldAttemptAutomaticReversal),
    reversal_attempted: Boolean(context.reversalAttempted),
    reversal_approved: Boolean(context.reversalApproved),
    systems_trace_no: context.systemsTraceNo ?? null,
    reference_id: context.referenceId ?? null,
    duration_ms: context.durationMs ?? null,
    response_code: context.responseCode ?? null,
    final_status_if_no_reversal: context.finalStatusIfNoReversal ?? null,
    safe_message: sanitizeGatewayMessage(context.safeMessage || null)
  });
}

module.exports = {
  sanitizeText,
  sanitizeHeaderFilename,
  normalizeBoolean,
  shouldUseMock,
  formatAmount,
  normalizeExpirationDate,
  getCardType,
  getCardBrandLabel,
  maskCardNumber,
  getLocalTransactionTime,
  getLocalTransactionDate,
  isApproved,
  isPartialApproval,
  isTimeoutResponseCode,
  hasUsableResponseCode,
  isRejectedResponseCode,
  getPaymentStatus,
  getPaymentMessage,
  formatVoucherDate,
  formatVoucherAmount,
  extractNameParts,
  normalizeShopperIp,
  getShopperIp,
  getBrowserThreeDSData,
  REDACTED_VALUE,
  maskPanForLog,
  maskReferenceIdForLog,
  maskEmailForLog,
  maskPhoneForLog,
  sanitizeForLog,
  sanitizeNeoResponseForClient,
  sanitizePaymentForClient,
  sanitizeUrlForLog,
  sanitizeGatewayMessage,
  buildAxiosErrorLog,
  buildPaymentLogSummary,
  buildThreeDSEvaluationLogSummary,
  buildGatewayFailureLogSummary
};
