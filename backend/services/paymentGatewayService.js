const neonetService = require("./neonetService");
const {
  shouldUseMock,
  hasUsableResponseCode,
  isTimeoutResponseCode,
  isRejectedResponseCode,
  sanitizeGatewayMessage
} = require("./paymentHelpersService");
const { getNextSystemsTraceNo } = require("./paymentPersistenceService");
const { buildBasePayload } = require("./paymentPayloadService");

function buildMockResponse(payload) {
  return {
    ResponseCode: "00",
    RetrievalRefNo: `MOCK${payload.SystemsTraceNo}`,
    AuthIdResponse: "MOCKOK",
    SystemsTraceNo: payload.SystemsTraceNo,
    AmountTrans: payload.Amount.AmountTrans,
    Message: "Mock payment approved"
  };
}

async function dispatchPayment(payload, shopperIP) {
  if (shouldUseMock()) {
    return buildMockResponse(payload);
  }
  return neonetService.sendTransaction(payload, shopperIP);
}

function classifyGatewayError(error, context = {}) {
  const gatewayData = error?.data || error?.response?.data || null;
  const responseCode = String(gatewayData?.ResponseCode || "").trim();
  const httpStatus = Number(error?.status || error?.response?.status || 0) || null;
  const code = String(error?.code || "").trim() || null;
  const message = String(error?.message || "").trim();
  const hadRequest = Boolean(
    error?.hadRequest !== undefined ? error?.hadRequest : error?.request
  );
  const hadResponse = Boolean(
    error?.hadResponse !== undefined ? error?.hadResponse : error?.response
  );
  const hasGatewayResponseCode = hasUsableResponseCode(responseCode);
  const loweredMessage = message.toLowerCase();

  function buildResult({
    category,
    requestMayHaveReachedGateway,
    isGatewayTimeout = false,
    isTransportAmbiguous = false,
    isDefinitelyPreDispatch = false,
    shouldAttemptAutomaticReversal = false,
    finalStatusIfNoReversal = "timeout",
    safeMessage
  }) {
    return {
      category,
      code,
      httpStatus,
      hadRequest,
      hadResponse,
      requestMayHaveReachedGateway,
      isGatewayTimeout,
      isTransportAmbiguous,
      isDefinitelyPreDispatch,
      shouldAttemptAutomaticReversal,
      reversalReason: shouldAttemptAutomaticReversal ? category : null,
      finalStatusIfNoReversal,
      safeMessage:
        safeMessage ||
        sanitizeGatewayMessage(message) ||
        "Error de comunicacion con NeoNet",
      responseCode: responseCode || null
    };
  }

  if (context.source === "persistence" || error?.type === "PERSISTENCE_ERROR") {
    return buildResult({
      category: "persistence_error",
      requestMayHaveReachedGateway: false,
      isDefinitelyPreDispatch: true,
      finalStatusIfNoReversal: "timeout",
      safeMessage: "Error persistiendo resultado del pago"
    });
  }

  if (hasGatewayResponseCode) {
    if (isTimeoutResponseCode(responseCode)) {
      return buildResult({
        category: "gateway_timeout_response",
        requestMayHaveReachedGateway: true,
        isGatewayTimeout: true,
        shouldAttemptAutomaticReversal: true,
        finalStatusIfNoReversal: "timeout",
        safeMessage: "NeoNet reporto timeout de la transaccion"
      });
    }

    if (isRejectedResponseCode(responseCode)) {
      return buildResult({
        category: "gateway_rejection_response",
        requestMayHaveReachedGateway: true,
        finalStatusIfNoReversal: "rejected",
        safeMessage: "NeoNet rechazo la transaccion"
      });
    }
  }

  if (httpStatus >= 400 && httpStatus < 500) {
    const category =
      httpStatus === 401 || httpStatus === 403
        ? "authentication_error"
        : "http_client_error";

    return buildResult({
      category,
      requestMayHaveReachedGateway: false,
      isDefinitelyPreDispatch: true,
      finalStatusIfNoReversal: "timeout",
      safeMessage: "NeoNet devolvio un error HTTP de cliente"
    });
  }

  if (httpStatus >= 500) {
    return buildResult({
      category: "http_server_error",
      requestMayHaveReachedGateway: hadRequest || hadResponse,
      isTransportAmbiguous: true,
      shouldAttemptAutomaticReversal: hadRequest || hadResponse,
      finalStatusIfNoReversal: "timeout",
      safeMessage: "NeoNet devolvio un error HTTP del servidor"
    });
  }

  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return buildResult({
      category: "dns_error",
      requestMayHaveReachedGateway: false,
      isDefinitelyPreDispatch: true,
      finalStatusIfNoReversal: "timeout",
      safeMessage: "No fue posible resolver el host de NeoNet"
    });
  }

  if (code === "ECONNREFUSED") {
    return buildResult({
      category: "connection_refused",
      requestMayHaveReachedGateway: false,
      isDefinitelyPreDispatch: true,
      finalStatusIfNoReversal: "timeout",
      safeMessage: "La conexion con NeoNet fue rechazada"
    });
  }

  if (code === "ECONNRESET" || loweredMessage.includes("socket hang up")) {
    return buildResult({
      category: code === "ECONNRESET" ? "connection_reset" : "network_error_ambiguous",
      requestMayHaveReachedGateway: hadRequest,
      isTransportAmbiguous: true,
      shouldAttemptAutomaticReversal: hadRequest,
      finalStatusIfNoReversal: "timeout",
      safeMessage: "La conexion con NeoNet se cerro de forma inesperada"
    });
  }

  if (code === "ETIMEDOUT") {
    return buildResult({
      category: "socket_timeout",
      requestMayHaveReachedGateway: hadRequest,
      isTransportAmbiguous: true,
      shouldAttemptAutomaticReversal: hadRequest,
      finalStatusIfNoReversal: "timeout",
      safeMessage: "La conexion con NeoNet excedio el tiempo de espera"
    });
  }

  if (code === "ECONNABORTED") {
    return buildResult({
      category: "axios_timeout",
      requestMayHaveReachedGateway: hadRequest,
      isTransportAmbiguous: true,
      shouldAttemptAutomaticReversal: hadRequest,
      finalStatusIfNoReversal: "timeout",
      safeMessage: "La solicitud a NeoNet excedio el tiempo de espera"
    });
  }

  if (
    loweredMessage.includes("unexpected token") ||
    loweredMessage.includes("parse") ||
    loweredMessage.includes("invalid http")
  ) {
    return buildResult({
      category: "invalid_http_response",
      requestMayHaveReachedGateway: hadRequest || hadResponse,
      isTransportAmbiguous: true,
      shouldAttemptAutomaticReversal: hadRequest || hadResponse,
      finalStatusIfNoReversal: "timeout",
      safeMessage: "Se recibio una respuesta HTTP invalida de NeoNet"
    });
  }

  if (hadRequest && !hadResponse) {
    return buildResult({
      category: "network_error_ambiguous",
      requestMayHaveReachedGateway: true,
      isTransportAmbiguous: true,
      shouldAttemptAutomaticReversal: true,
      finalStatusIfNoReversal: "timeout",
      safeMessage: "No se recibio respuesta de NeoNet despues del intento de envio"
    });
  }

  if (
    error?.type === "VALIDATION_ERROR" ||
    loweredMessage.includes("monto invalido") ||
    loweredMessage.includes("no configurado")
  ) {
    return buildResult({
      category: "validation_error",
      requestMayHaveReachedGateway: false,
      isDefinitelyPreDispatch: true,
      finalStatusIfNoReversal: "timeout",
      safeMessage: "Error local antes de enviar la solicitud a NeoNet"
    });
  }

  return buildResult({
    category: hadRequest ? "unknown_transport_error" : "validation_error",
    requestMayHaveReachedGateway: hadRequest,
    isTransportAmbiguous: hadRequest,
    isDefinitelyPreDispatch: !hadRequest,
    shouldAttemptAutomaticReversal: hadRequest,
    finalStatusIfNoReversal: "timeout",
    safeMessage: hadRequest
      ? "Se produjo un error de transporte ambiguo con NeoNet"
      : "Se produjo un error local antes del despacho"
  });
}

function mapGatewayError(error) {
  const classification = classifyGatewayError(error);

  if (classification.category === "gateway_rejection_response") {
    return {
      statusCode: 502,
      message: error?.message || "NeoNet rechazo la transaccion",
      detail: {
        category: classification.category,
        code: classification.code,
        http_status: classification.httpStatus,
        response_code: classification.responseCode,
        final_status_if_no_reversal: classification.finalStatusIfNoReversal
      }
    };
  }

  if (
    classification.category === "gateway_timeout_response" ||
    classification.isTransportAmbiguous
  ) {
    return {
      statusCode:
        classification.category === "gateway_timeout_response" ||
        classification.isTransportAmbiguous
          ? 504
          : classification.httpStatus || 504,
      message: classification.safeMessage || "No se recibio respuesta concluyente de NeoNet",
      detail: {
        category: classification.category,
        code: classification.code,
        http_status: classification.httpStatus,
        request_may_have_reached_gateway: classification.requestMayHaveReachedGateway,
        should_attempt_automatic_reversal: classification.shouldAttemptAutomaticReversal,
        final_status_if_no_reversal: classification.finalStatusIfNoReversal
      }
    };
  }

  return {
    statusCode:
      classification.httpStatus ||
      (classification.category === "authentication_error" ? 401 : 500),
    message: classification.safeMessage || error?.message || "Error procesando pago",
    detail: {
      category: classification.category,
      code: classification.code,
      http_status: classification.httpStatus,
      request_may_have_reached_gateway: classification.requestMayHaveReachedGateway,
      should_attempt_automatic_reversal: classification.shouldAttemptAutomaticReversal,
      final_status_if_no_reversal: classification.finalStatusIfNoReversal
    }
  };
}

async function executeAutomaticReverse(originalPayload, shopperIP) {
  const reversePayload = buildBasePayload();

  reversePayload.MessageTypeId = "0400";
  reversePayload.ProcessingCode = "000000";
  reversePayload.SystemsTraceNo = await getNextSystemsTraceNo();
  reversePayload.Card.Type = originalPayload.Card?.Type || "";
  reversePayload.Card.PrimaryAcctNum = originalPayload.Card?.PrimaryAcctNum || "";
  reversePayload.Card.DateExpiration = originalPayload.Card?.DateExpiration || "";
  reversePayload.Card.Cvv2 = originalPayload.Card?.Cvv2 || "";
  reversePayload.Amount.AmountTrans = originalPayload.Amount?.AmountTrans || "";
  reversePayload.PrivateUse63.HostReferenceData31 =
    originalPayload.PrivateUse63?.HostReferenceData31 || "";

  if (originalPayload.PayerAuthentication?.Step) {
    reversePayload.PayerAuthentication = {
      Step: String(originalPayload.PayerAuthentication.Step || ""),
      ReferenceId: String(originalPayload.PayerAuthentication.ReferenceId || "")
    };
  }

  return dispatchPayment(reversePayload, shopperIP);
}

module.exports = {
  dispatchPayment,
  classifyGatewayError,
  mapGatewayError,
  executeAutomaticReverse
};
