const {
  normalizeExpirationDate,
  getCardBrandLabel,
  maskCardNumber,
  isApproved,
  getPaymentStatus,
  getPaymentMessage,
  sanitizeText,
  sanitizeForLog,
  sanitizeNeoResponseForClient,
  sanitizePaymentForClient,
  buildAxiosErrorLog,
  maskReferenceIdForLog
} = require("./paymentHelpersService");
const {
  dispatchPayment,
  mapGatewayError,
  executeAutomaticReverse
} = require("./paymentGatewayService");
const {
  getNextSystemsTraceNo,
  insertPayment,
  getPaymentById,
  getSubmissionPaymentData,
  updatePaymentAfterGatewayStep
} = require("./paymentPersistenceService");
const { buildStandardSalePayload } = require("./paymentPayloadService");
const {
  buildThreeDSStep1Payload,
  buildThreeDSStepPayload,
  extractThreeDSData,
  evaluateThreeDSResult,
  buildThreeDSClientData,
  mergeThreeDSRawResponse
} = require("./paymentThreeDSService");

function validateCreatePaymentInput(body = {}) {
  const {
    submission_id,
    amount,
    card_number,
    expiration_date,
    cvv,
    cardholder_name,
    email,
    phone,
    address
  } = body;

  if (!submission_id || !amount || !card_number || !expiration_date || !cvv) {
    return {
      ok: false,
      statusCode: 400,
      body: {
        ok: false,
        message: "Faltan campos obligatorios"
      }
    };
  }

  const sanitizedCardNumber = String(card_number || "").replace(/\D/g, "");
  const sanitizedExpiration = String(expiration_date || "").replace(/\D/g, "");
  const sanitizedCvv = String(cvv || "").replace(/\D/g, "");
  const normalizedExpiration = normalizeExpirationDate(sanitizedExpiration);

  if (!normalizedExpiration) {
    return {
      ok: false,
      statusCode: 400,
      body: {
        ok: false,
        message: "La fecha de expiración no es valida. Usa formato MMYY o YYMM."
      }
    };
  }

  return {
    ok: true,
    value: {
      submission_id,
      amount,
      sanitizedCardNumber,
      sanitizedCvv,
      normalizedExpiration,
      cardholderName: sanitizeText(cardholder_name || "", 80),
      email: sanitizeText(email || "", 120),
      phone: sanitizeText(String(phone || "").replace(/\D/g, "").slice(0, 20), 20),
      address: sanitizeText(address || "", 120),
      cardBrand: getCardBrandLabel(sanitizedCardNumber),
      maskedCard: maskCardNumber(sanitizedCardNumber)
    }
  };
}

function shouldUseThreeDSFlow() {
  // Las credenciales activas pertenecen al perfil 3DS de NeoNet. La marca,
  // origen o BIN de la tarjeta no determina el flujo de autenticacion.
  return true;
}

function buildPaymentCustomerData(submissionData = {}, overrides = {}) {
  const emailFromRequestOrSubmission = overrides.email || submissionData?.correo || "";
  const phoneFromRequestOrSubmission = overrides.phone || submissionData?.telefono || "";
  const addressFromRequestOrSubmission = overrides.address || submissionData?.direccion || "";
  const isProduction =
    String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  const fallbackTestEmail =
    isProduction ? "" : String(process.env.NEOPAY_3DS_TEST_EMAIL || "").trim();
  const fallbackTestPhone =
    isProduction ? "" : String(process.env.NEOPAY_3DS_TEST_PHONE || "55554444").trim();
  const fallbackTestAddress =
    isProduction
      ? ""
      : String(process.env.NEOPAY_3DS_TEST_ADDRESS || "AVENIDA REFORMA ZONA 10").trim();

  return {
    ...submissionData,
    correo: emailFromRequestOrSubmission || fallbackTestEmail,
    telefono: phoneFromRequestOrSubmission || fallbackTestPhone,
    direccion: addressFromRequestOrSubmission || fallbackTestAddress
  };
}

function buildCreatePaymentResponse(paymentStatus, payment, neoResponse, threeDS = null) {
  const body = {
    ok: true,
    status: paymentStatus,
    message: getPaymentMessage(paymentStatus),
    payment:
      typeof sanitizePaymentForClient === "function"
        ? sanitizePaymentForClient(payment)
        : payment,
    neo_response:
      typeof sanitizeNeoResponseForClient === "function"
        ? sanitizeNeoResponseForClient(neoResponse)
        : neoResponse
  };

  if (threeDS) {
    body.three_ds = threeDS;
  }

  return body;
}

function buildSafeGatewayErrorLog(error) {
  return typeof buildAxiosErrorLog === "function" ? buildAxiosErrorLog(error) : error;
}

function resolveTransactionId(neoResponse, fallbackValue) {
  return (
    neoResponse?.TransactionId ||
    neoResponse?.TransactionIdentifier ||
    neoResponse?.RetrievalRefNo ||
    neoResponse?.SystemsTraceNo ||
    fallbackValue
  );
}

async function persistPaymentResult({
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
  return insertPayment({
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
  });
}

async function updatePaymentResult(paymentId, {
  paymentStatus,
  transactionId,
  neoResponse,
  rawResponse,
  payloadSystemsTraceNo
}) {
  return updatePaymentAfterGatewayStep(paymentId, {
    paymentStatus,
    transactionId,
    neoResponse,
    rawResponse,
    payloadSystemsTraceNo
  });
}

function buildThreeDSStep1RawResponse(neoResponse) {
  return mergeThreeDSRawResponse({}, {
    flow: "3ds",
    latest: neoResponse,
    step1: neoResponse,
    threeDS: buildThreeDSClientData(neoResponse)
  });
}

function buildThreeDSMergedResponse(
  existingPayment,
  stepKey,
  neoResponse,
  paymentStatus,
  reversalRequest
) {
  const existingRaw = existingPayment?.raw_response || {};
  const threeDSData = buildThreeDSClientData(neoResponse);

  return mergeThreeDSRawResponse(existingRaw, {
    latest: neoResponse,
    [stepKey]: neoResponse,
    reversal_request: reversalRequest
      ? {
          step: stepKey,
          payload: reversalRequest
        }
      : undefined,
    threeDS: {
      ...(existingRaw.threeDS || {}),
      ...threeDSData,
      currentStatus: paymentStatus
    }
  });
}

function buildPendingThreeDSBody(paymentStatus, payment, neoResponse) {
  return buildCreatePaymentResponse(
    paymentStatus,
    payment,
    neoResponse,
    buildThreeDSClientData(neoResponse)
  );
}

async function handleAutomaticReverseIfTimeout({
  paymentStatus,
  neoResponse,
  payload,
  shopperIP
}) {
  let nextPaymentStatus = paymentStatus;

  if (nextPaymentStatus === "timeout") {
    try {
      neoResponse.reverse = await executeAutomaticReverse(payload, shopperIP);
      if (isApproved(neoResponse.reverse?.ResponseCode)) {
        nextPaymentStatus = "reversed";
      }
    } catch (reverseError) {
      neoResponse.reverse_error = mapGatewayError(reverseError);
    }
  }

  return nextPaymentStatus;
}

async function createStandardPayment(input, context, validationValue) {
  const {
    submission_id,
    amount,
    sanitizedCardNumber,
    sanitizedCvv,
    normalizedExpiration,
    cardholderName,
    cardBrand,
    maskedCard
  } = validationValue;

  const systemsTraceNo = await getNextSystemsTraceNo();
  const payload = buildStandardSalePayload({
    systemsTraceNo,
    amount,
    sanitizedCardNumber,
    normalizedExpiration,
    sanitizedCvv
  });

  const shopperIP = context.shopperIP;
  const neoResponse = await dispatchPayment(payload, shopperIP);
  const interpretedPaymentStatus = getPaymentStatus(neoResponse.ResponseCode);
  const paymentStatus = await handleAutomaticReverseIfTimeout({
    paymentStatus: interpretedPaymentStatus,
    neoResponse,
    payload,
    shopperIP
  });
  const transactionId = resolveTransactionId(neoResponse, systemsTraceNo);

  const result = await persistPaymentResult({
    submission_id,
    amount,
    paymentStatus,
    transactionId,
    neoResponse,
    payloadSystemsTraceNo: systemsTraceNo,
    maskedCard,
    cardBrand,
    cardholderName
  });

  return {
    statusCode: 200,
    body: buildCreatePaymentResponse(paymentStatus, result.rows[0], neoResponse)
  };
}

async function createThreeDSPayment(input, context, validationValue) {
  const {
    submission_id,
    amount,
    sanitizedCardNumber,
    sanitizedCvv,
    normalizedExpiration,
    cardholderName,
    email,
    phone,
    address,
    cardBrand,
    maskedCard
  } = validationValue;

  const systemsTraceNo = await getNextSystemsTraceNo();
  const submissionData = await getSubmissionPaymentData(submission_id);
  const paymentCustomerData = buildPaymentCustomerData(submissionData, {
    email,
    phone,
    address
  });

  if (!paymentCustomerData.correo) {
    return {
      statusCode: 400,
      body: {
        ok: false,
        message: "Se requiere email para procesar el pago 3DS"
      }
    };
  }

  const payload = buildThreeDSStep1Payload({
    systemsTraceNo,
    amount,
    sanitizedCardNumber,
    normalizedExpiration,
    sanitizedCvv,
    cardholderName,
    submissionData: paymentCustomerData
  });

  const shopperIP = context.shopperIP;
  traceThreeDS("createPayment.request", {
    submissionId: submission_id,
    step: "1",
    systemsTraceNo,
    shopperIP,
    requestPayload: payload
  });
  const neoResponse = await dispatchPayment(payload, shopperIP);

  const threeDSResult = evaluateThreeDSResult({
    requestedStep: "1",
    neoResponse
  });

  traceThreeDS("createPayment.response", {
    submissionId: submission_id,
    step: "1",
    systemsTraceNo,
    responseCode: neoResponse?.ResponseCode,
    alternateHostResponse: neoResponse?.PrivateUse63?.AlternateHostResponse22,
    neoResponse
  });

  if (threeDSResult.isPending) {
    const paymentStatus = "pending_3ds";
    const transactionId = resolveTransactionId(neoResponse, systemsTraceNo);
    const persisted = await persistPaymentResult({
      submission_id,
      amount,
      paymentStatus,
      transactionId,
      neoResponse,
      rawResponse: buildThreeDSStep1RawResponse(neoResponse),
      payloadSystemsTraceNo: systemsTraceNo,
      maskedCard,
      cardBrand,
      cardholderName
    });

    return {
      statusCode: 200,
      body: buildPendingThreeDSBody(paymentStatus, persisted.rows[0], neoResponse)
    };
  }

  const interpretedPaymentStatus = threeDSResult.status || getPaymentStatus(neoResponse.ResponseCode);
  const paymentStatus = await handleAutomaticReverseIfTimeout({
    paymentStatus: interpretedPaymentStatus,
    neoResponse,
    payload,
    shopperIP
  });
  const transactionId = resolveTransactionId(neoResponse, systemsTraceNo);

  const result = await persistPaymentResult({
    submission_id,
    amount,
    paymentStatus,
    transactionId,
    neoResponse,
    payloadSystemsTraceNo: systemsTraceNo,
    maskedCard,
    cardBrand,
    cardholderName
  });

  return {
    statusCode: 200,
    body: buildCreatePaymentResponse(paymentStatus, result.rows[0], neoResponse)
  };
}

async function createPayment(input, context = {}) {
  try {
    const validation = validateCreatePaymentInput(input || {});
    if (!validation.ok) {
      return {
        statusCode: validation.statusCode,
        body: validation.body
      };
    }

    const { sanitizedCardNumber } = validation.value;

    if (shouldUseThreeDSFlow()) {
      return createThreeDSPayment(input, context, validation.value);
    }

    return createStandardPayment(input, context, validation.value);
  } catch (error) {
    const gatewayError = mapGatewayError(error);
    console.error("createPayment:", buildSafeGatewayErrorLog(error));
    return {
      statusCode: gatewayError.statusCode,
      body: {
        ok: false,
        message: gatewayError.message,
        detail: gatewayError.detail
      }
    };
  }
}

function resolveStoredThreeDSReferenceId(payment) {
  const threeDS =
    payment?.raw_response?.threeDS ||
    extractThreeDSData(payment?.raw_response?.latest || payment?.raw_response || {});

  return threeDS?.referenceId || payment?.raw_response?.threeDS?.referenceId || "";
}

function resolveStoredSystemsTraceNo(payment) {
  return payment?.audit_number || payment?.raw_response?.latest?.SystemsTraceNo || "";
}

function buildContinuePaymentError(statusCode, message) {
  return {
    statusCode,
    body: {
      ok: false,
      message
    }
  };
}

function shouldTraceThreeDS() {
  return String(process.env.NEOPAY_3DS_DEBUG || "")
    .trim()
    .toLowerCase() === "true";
}

function traceThreeDS(eventName, details = {}) {
  if (!shouldTraceThreeDS()) return;

  const trace = {
    payment_id: details.paymentId ?? null,
    submission_id: details.submissionId ?? null,
    current_status: details.currentStatus ?? null,
    step: details.step ?? null,
    systems_trace_no: details.systemsTraceNo ?? null,
    shopper_ip: details.shopperIP ?? null,
    response_step: details.neoResponse?.PayerAuthentication?.Step ?? null,
    response_type_operation: details.neoResponse?.TypeOperation ?? null,
    response_message_type: details.neoResponse?.MessageTypeId ?? null,
    response_systems_trace_no: details.neoResponse?.SystemsTraceNo ?? null,
    response_keys: details.neoResponse ? Object.keys(details.neoResponse) : [],
    response_has_reference: Boolean(details.neoResponse?.PayerAuthentication?.ReferenceId),
    response_has_access_token: Boolean(details.neoResponse?.PayerAuthentication?.AccessToken),
    reference_id: details.referenceId
      ? typeof maskReferenceIdForLog === "function"
        ? maskReferenceIdForLog(details.referenceId)
        : "[REDACTED]"
      : null,
    response_code: details.responseCode ?? null,
    alternate_host_response: details.alternateHostResponse ?? null,
    retrieval_ref_no: details.retrievalRefNo ?? null,
    auth_id_response: details.authIdResponse ?? null
  };

  if (details.requestPayload) {
    trace.request_payload = details.requestPayload;
  }

  try {
    console.log(
      `[3DS TRACE] ${eventName}`,
      JSON.stringify(
        typeof sanitizeForLog === "function" ? sanitizeForLog(trace) : trace,
        null,
        2
      )
    );
  } catch (_error) {
    console.log(
      `[3DS TRACE] ${eventName}`,
      typeof sanitizeForLog === "function" ? sanitizeForLog(trace) : trace
    );
  }
}

async function continuePayment(paymentId, _input = {}, context = {}) {
  try {
    const payment = await getPaymentById(paymentId);

    if (!payment) {
      return buildContinuePaymentError(404, "Pago no encontrado");
    }

    if (payment.status === "approved") {
      return {
        statusCode: 200,
        body: buildCreatePaymentResponse(
          payment.status,
          payment,
          payment.raw_response?.latest || payment.raw_response || {}
        )
      };
    }

    if (payment.status !== "pending_3ds" && payment.status !== "challenge_required") {
      return buildContinuePaymentError(
        400,
        "El pago no se encuentra en un estado valido para continuar autenticación 3DS"
      );
    }

    const referenceId = resolveStoredThreeDSReferenceId(payment);
    const systemsTraceNo = resolveStoredSystemsTraceNo(payment);

    if (!referenceId || !systemsTraceNo) {
      return buildContinuePaymentError(
        400,
        "No se encontraron datos suficientes para continuar la autenticación 3DS"
      );
    }

    const step = payment.status === "pending_3ds" ? "3" : "5";
    const payload = buildThreeDSStepPayload({
      systemsTraceNo,
      step,
      referenceId,
      browserData: context.browserData || {}
    });
    const shopperIP = context.shopperIP;

    traceThreeDS("continuePayment.request", {
      paymentId: Number(paymentId),
      submissionId: payment.submission_id,
      currentStatus: payment.status,
      step,
      systemsTraceNo,
      referenceId,
      shopperIP,
      browserData: context.browserData || {},
      payload
    });

    const neoResponse = await dispatchPayment(payload, shopperIP);

    traceThreeDS("continuePayment.response", {
      paymentId: Number(paymentId),
      submissionId: payment.submission_id,
      currentStatus: payment.status,
      step,
      systemsTraceNo,
      responseCode: neoResponse?.ResponseCode || "",
      alternateHostResponse:
        neoResponse?.PrivateUse63?.AlternateHostResponse22 || "",
      retrievalRefNo: neoResponse?.RetrievalRefNo || "",
      authIdResponse: neoResponse?.AuthIdResponse || "",
      payerAuthentication: neoResponse?.PayerAuthentication || {},
      neoResponse
    });

    const threeDSResult = evaluateThreeDSResult({
      requestedStep: step,
      neoResponse,
      storedReferenceId: referenceId
    });

    if (step === "3" && threeDSResult.isChallenge) {
      const paymentStatus = "challenge_required";
      const rawResponse = buildThreeDSMergedResponse(
        payment,
        "step3",
        neoResponse,
        paymentStatus,
        payload
      );
      const transactionId = resolveTransactionId(neoResponse, payment.transaction_id || systemsTraceNo);
      const updated = await updatePaymentResult(paymentId, {
        paymentStatus,
        transactionId,
        neoResponse,
        rawResponse,
        payloadSystemsTraceNo: systemsTraceNo
      });

      return {
        statusCode: 200,
        body: buildPendingThreeDSBody(paymentStatus, updated.rows[0], neoResponse)
      };
    }

    const paymentStatus = threeDSResult.status || getPaymentStatus(neoResponse.ResponseCode);
    const stepKey = step === "3" ? "step3" : "step5";
    const rawResponse = buildThreeDSMergedResponse(
      payment,
      stepKey,
      neoResponse,
      paymentStatus,
      payload
    );
    const transactionId = resolveTransactionId(neoResponse, payment.transaction_id || systemsTraceNo);
    const updated = await updatePaymentResult(paymentId, {
      paymentStatus,
      transactionId,
      neoResponse,
      rawResponse,
      payloadSystemsTraceNo: systemsTraceNo
    });

    return {
      statusCode: 200,
      body: buildCreatePaymentResponse(paymentStatus, updated.rows[0], neoResponse)
    };
  } catch (error) {
    const gatewayError = mapGatewayError(error);
    console.error("continuePayment:", buildSafeGatewayErrorLog(error));
    return {
      statusCode: gatewayError.statusCode,
      body: {
        ok: false,
        message: gatewayError.message,
        detail: gatewayError.detail
      }
    };
  }
}

module.exports = {
  createPayment,
  continuePayment
};
