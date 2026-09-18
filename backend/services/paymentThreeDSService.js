const {
  formatAmount,
  getCardType,
  extractNameParts,
  sanitizeText,
  isApproved,
  isTimeoutResponseCode,
  isRejectedResponseCode
} = require("./paymentHelpersService");
const { buildBasePayload } = require("./paymentPayloadService");

const DEFAULT_STEP_UP_URL =
  "https://cas.client.cardinaltrusted.com/centinelapi/V2/Cruise/StepUp";
const DEFAULT_LOCALITY = "GUATEMALA";
const DEFAULT_ADMIN_AREA = "GU";
const DEFAULT_COUNTRY = "GT";
const DEFAULT_POSTAL_CODE = "01010";
const DEFAULT_COMPANY = "DGAC";

function resolveThreeDSReturnUrl() {
  if (process.env.NEOPAY_3DS_RETURN_URL) {
    return process.env.NEOPAY_3DS_RETURN_URL;
  }

  const backendBaseUrl = process.env.BACKEND_BASE_URL || "http://localhost:4000";
  return `${backendBaseUrl.replace(/\/$/, "")}/api/payments/3ds/return`;
}

function resolveThreeDSStepUpUrl() {
  return process.env.NEOPAY_3DS_STEP_UP_URL || DEFAULT_STEP_UP_URL;
}

function buildBillingData({ cardholderName, submissionData = {} }) {
  const safeCardholderName = sanitizeText(
    cardholderName || submissionData.nombre_propietario || "",
    80
  ).toUpperCase();
  const { firstName, lastName } = extractNameParts(safeCardholderName);

  return {
    FirstName: firstName || "TARJETA",
    LastName: lastName || "DGAC",
    Company: sanitizeText(submissionData.company || DEFAULT_COMPANY, 40),
    AddressOne: sanitizeText(submissionData.direccion || DEFAULT_LOCALITY, 80),
    AddressTwo: "",
    Locality: sanitizeText(submissionData.locality || DEFAULT_LOCALITY, 40).toUpperCase(),
    AdministrativeArea: sanitizeText(
      submissionData.administrative_area || DEFAULT_ADMIN_AREA,
      10
    ).toUpperCase(),
    PostalCode: sanitizeText(submissionData.postal_code || DEFAULT_POSTAL_CODE, 10),
    Country: sanitizeText(submissionData.country || DEFAULT_COUNTRY, 2).toUpperCase(),
    Email: sanitizeText(submissionData.correo || "", 120),
    PhoneNumber: sanitizeText(
      String(submissionData.telefono || "").replace(/\D/g, "").slice(0, 20),
      20
    )
  };
}

function buildThreeDSStep1Payload({
  systemsTraceNo,
  amount,
  sanitizedCardNumber,
  normalizedExpiration,
  sanitizedCvv,
  cardholderName,
  submissionData
}) {
  const payload = buildBasePayload();
  payload.MessageTypeId = "0200";
  payload.ProcessingCode = "000000";
  payload.SystemsTraceNo = systemsTraceNo;
  payload.Card.Type = getCardType(sanitizedCardNumber);
  payload.Card.PrimaryAcctNum = sanitizedCardNumber;
  payload.Card.DateExpiration = normalizedExpiration;
  payload.Card.Cvv2 = sanitizedCvv;
  payload.Amount.AmountTrans = formatAmount(amount);
  payload.BillTo = buildBillingData({ cardholderName, submissionData });
  payload.PayerAuthentication.Step = "1";
  payload.PayerAuthentication.UrlCommerce = resolveThreeDSReturnUrl();
  payload.PayerAuthentication.ReferenceId = "";
  return payload;
}

function buildThreeDSStepPayload({ systemsTraceNo, step, referenceId, browserData = {} }) {
  const payload = buildBasePayload();
  payload.MessageTypeId = "0200";
  payload.ProcessingCode = "000000";
  payload.SystemsTraceNo = systemsTraceNo;
  payload.PayerAuthentication.Step = String(step);
  payload.PayerAuthentication.ReferenceId = String(referenceId || "");
  payload.PayerAuthentication.browserLanguage = String(
    browserData.browserLanguage || ""
  );
  payload.PayerAuthentication.browserUserAgent = String(
    browserData.browserUserAgent || ""
  );
  payload.PayerAuthentication.browserAcceptHeader = String(
    browserData.browserAcceptHeader || ""
  );
  payload.PayerAuthentication.browserScreenWidth = String(
    browserData.browserScreenWidth || ""
  );
  payload.PayerAuthentication.browserScreenHeight = String(
    browserData.browserScreenHeight || ""
  );
  payload.PayerAuthentication.browserColorDepth = String(
    browserData.browserColorDepth || ""
  );
  payload.PayerAuthentication.browserJavaEnabled = String(
    browserData.browserJavaEnabled || ""
  );
  payload.PayerAuthentication.browserTZ = String(
    browserData.browserTZ || ""
  );
  return payload;
}

function extractThreeDSData(neoResponse = {}) {
  const payerAuthentication = neoResponse.PayerAuthentication || {};

  return {
    step: normalizeThreeDSStep(payerAuthentication.Step),
    accessToken: payerAuthentication.AccessToken || "",
    referenceId: payerAuthentication.ReferenceId || "",
    deviceDataCollectionUrl: payerAuthentication.DeviceDataCollectionUrl || "",
    specificationVersion: payerAuthentication.SpecificationVersion || "",
    directoryServerTransactionId:
      payerAuthentication.DirectoryServerTransactionId || ""
  };
}

function normalizeThreeDSStep(step) {
  if (step === null || step === undefined) return "";
  return String(step).trim();
}

function evaluateThreeDSResult({
  requestedStep,
  neoResponse,
  storedReferenceId = ""
} = {}) {
  const safeResponse = neoResponse && typeof neoResponse === "object" ? neoResponse : {};
  const requested = normalizeThreeDSStep(requestedStep);
  const responseCode = String(safeResponse?.ResponseCode || "").trim();
  const data = extractThreeDSData(safeResponse);
  const responseStep = normalizeThreeDSStep(data.step);
  const normalizedStoredReferenceId = String(storedReferenceId || "").trim();
  const responseReferenceId = String(data.referenceId || "").trim();
  const effectiveReferenceId = responseReferenceId || normalizedStoredReferenceId;
  const hasResponseReferenceId = Boolean(responseReferenceId);
  const hasStoredReferenceId = Boolean(normalizedStoredReferenceId);
  const hasReferenceId = Boolean(effectiveReferenceId);
  const hasAccessToken = Boolean(String(data.accessToken || "").trim());
  const hasDeviceDataCollectionUrl = Boolean(String(data.deviceDataCollectionUrl || "").trim());
  const referenceIdMatchesStored =
    !hasResponseReferenceId ||
    !hasStoredReferenceId ||
    responseReferenceId === normalizedStoredReferenceId;
  const isApprovedCode = isApproved(responseCode);
  const isTimeoutCode = isTimeoutResponseCode(responseCode);
  const isRejectedCode = isRejectedResponseCode(responseCode);

  const buildResult = (status, reason, extra = {}) => ({
    status,
    reason,
    responseCode: responseCode || null,
    requestedStep: requested || null,
    responseStep: responseStep || null,
    isApprovedCode,
    isPending: status === "pending_3ds",
    isChallenge: status === "challenge_required",
    isFinal: status === "approved",
    hasReferenceId,
    hasResponseReferenceId,
    hasStoredReferenceId,
    hasAccessToken,
    hasDeviceDataCollectionUrl,
    referenceIdMatchesStored,
    referenceId: effectiveReferenceId || null,
    ...extra
  });

  if (!responseCode) {
    return buildResult("timeout", "missing_response_code");
  }

  if (isTimeoutCode) {
    return buildResult("timeout", "gateway_timeout");
  }

  if (isRejectedCode) {
    return buildResult("rejected", "gateway_rejected");
  }

  if (!referenceIdMatchesStored) {
    return buildResult("timeout", "reference_id_mismatch");
  }

  if (requested === "1") {
    if (
      responseStep === "2" &&
      hasResponseReferenceId &&
      hasAccessToken &&
      hasDeviceDataCollectionUrl
    ) {
      return buildResult("pending_3ds", "step1_pending");
    }

    return buildResult("timeout", "step1_incomplete");
  }

  if (requested === "3") {
    if (responseStep === "2") {
      return buildResult("timeout", "step3_contradictory");
    }

    // NeoNet devuelve Step 4 despues del Paso 3 cuando el emisor requiere
    // challenge. Step 5 se conserva por compatibilidad con respuestas previas.
    if (responseStep === "4" || responseStep === "5") {
      if (hasReferenceId && hasAccessToken) {
        return buildResult("challenge_required", "step3_challenge");
      }

      return buildResult("timeout", "step3_challenge_incomplete");
    }

    if (responseStep && responseStep !== "3") {
      return buildResult("timeout", "step3_contradictory");
    }

    return buildResult("approved", "step3_frictionless_approved");
  }

  if (requested === "5") {
    // NeoNet confirma la operacion financiera del Paso 5 con Step = 5.
    // Solo los pasos previos indican que el challenge aun no ha finalizado.
    if (responseStep === "2" || responseStep === "3") {
      return buildResult("timeout", "step5_incomplete");
    }

    return buildResult("approved", "step5_approved");
  }

  return buildResult("timeout", "unsupported_requested_step");
}

function buildThreeDSClientData(neoResponse = {}) {
  const data = extractThreeDSData(neoResponse);

  return {
    referenceId: data.referenceId,
    accessToken: data.accessToken,
    deviceDataCollectionUrl: data.deviceDataCollectionUrl,
    step: data.step,
    stepUpUrl: resolveThreeDSStepUpUrl(),
    returnUrl: resolveThreeDSReturnUrl()
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)])
    );
  }

  return value;
}

function isUsefulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return true;
}

function isMeaningfulObject(value) {
  return isPlainObject(value) && Object.keys(value).length > 0;
}

function keepExistingWhenIncomingEmpty(existingValue, incomingValue) {
  if (!isUsefulValue(incomingValue)) {
    return cloneValue(existingValue);
  }

  return cloneValue(incomingValue);
}

function mergeLatest(existingLatest, incomingLatest) {
  const hasIncomingLatest = isMeaningfulObject(incomingLatest);
  const hasExistingLatest = isMeaningfulObject(existingLatest);

  if (!hasIncomingLatest) {
    return hasExistingLatest ? cloneValue(existingLatest) : undefined;
  }

  const nextLatest = cloneValue(incomingLatest);
  const existingLatestObject = hasExistingLatest ? existingLatest : {};

  if (
    isApproved(existingLatestObject?.reverse?.ResponseCode) &&
    !isUsefulValue(nextLatest.reverse)
  ) {
    nextLatest.reverse = cloneValue(existingLatestObject.reverse);
  }

  if (isMeaningfulObject(existingLatestObject?.reverse_error) && !isUsefulValue(nextLatest.reverse_error)) {
    nextLatest.reverse_error = cloneValue(existingLatestObject.reverse_error);
  }

  return nextLatest;
}

function mergeHistoricalStep(existingStep, incomingStep) {
  if (!isMeaningfulObject(incomingStep)) {
    return isMeaningfulObject(existingStep) ? cloneValue(existingStep) : undefined;
  }

  return cloneValue(incomingStep);
}

function normalizeUsefulStep(step) {
  const normalized = normalizeThreeDSStep(step);
  return normalized || "";
}

function shouldKeepExistingCurrentStep(existingStep, incomingStep) {
  if (!existingStep) return false;
  if (!incomingStep) return true;

  if (existingStep === "5" && (incomingStep === "2" || incomingStep === "3")) {
    return true;
  }

  return false;
}

function canAdvanceCurrentStatus(existingStatus, incomingStatus) {
  const existing = String(existingStatus || "").trim();
  const incoming = String(incomingStatus || "").trim();

  if (!incoming) return false;
  if (!existing) return true;
  if (existing === incoming) return true;

  if (existing === "reversed" || existing === "cancelled") {
    return false;
  }

  if (existing === "approved") {
    return incoming !== "pending_3ds" && incoming !== "challenge_required" && incoming !== "timeout";
  }

  if (existing === "challenge_required") {
    return incoming !== "pending_3ds";
  }

  if (existing === "timeout") {
    return incoming === "reversed";
  }

  return true;
}

function mergeThreeDSMetadata(existingThreeDS, incomingThreeDS) {
  const current = isPlainObject(existingThreeDS) ? existingThreeDS : {};
  const updates = isPlainObject(incomingThreeDS) ? incomingThreeDS : {};

  const currentReferenceId = String(current.referenceId || "").trim();
  const incomingReferenceId = String(updates.referenceId || "").trim();
  const referenceIdMismatch =
    Boolean(currentReferenceId) &&
    Boolean(incomingReferenceId) &&
    currentReferenceId !== incomingReferenceId;

  const mergedStepCurrent = normalizeUsefulStep(current.step);
  const mergedStepIncoming = normalizeUsefulStep(updates.step);
  const mergedStatusCurrent = String(current.currentStatus || "").trim();
  const mergedStatusIncoming = String(updates.currentStatus || "").trim();

  return {
    ...cloneValue(current),
    ...cloneValue(updates),
    referenceId: referenceIdMismatch
      ? currentReferenceId
      : keepExistingWhenIncomingEmpty(currentReferenceId, incomingReferenceId),
    accessToken: keepExistingWhenIncomingEmpty(current.accessToken, updates.accessToken),
    deviceDataCollectionUrl: keepExistingWhenIncomingEmpty(
      current.deviceDataCollectionUrl,
      updates.deviceDataCollectionUrl
    ),
    step: shouldKeepExistingCurrentStep(mergedStepCurrent, mergedStepIncoming)
      ? mergedStepCurrent
      : keepExistingWhenIncomingEmpty(mergedStepCurrent, mergedStepIncoming),
    currentStatus: canAdvanceCurrentStatus(mergedStatusCurrent, mergedStatusIncoming)
      ? mergedStatusIncoming
      : mergedStatusCurrent || mergedStatusIncoming || "",
    stepUpUrl: keepExistingWhenIncomingEmpty(current.stepUpUrl, updates.stepUpUrl),
    returnUrl: keepExistingWhenIncomingEmpty(current.returnUrl, updates.returnUrl),
    referenceIdMismatch:
      referenceIdMismatch ||
      Boolean(current.referenceIdMismatch) ||
      Boolean(updates.referenceIdMismatch)
  };
}

function preserveApprovedReverse(existingReverse, incomingReverse) {
  const currentApproved = isApproved(existingReverse?.ResponseCode);
  const incomingApproved = isApproved(incomingReverse?.ResponseCode);

  if (currentApproved && !incomingApproved) {
    return cloneValue(existingReverse);
  }

  if (isMeaningfulObject(incomingReverse)) {
    return cloneValue(incomingReverse);
  }

  return isMeaningfulObject(existingReverse) ? cloneValue(existingReverse) : undefined;
}

function mergeGatewayFailure(existingGatewayFailure, incomingGatewayFailure) {
  const current = isPlainObject(existingGatewayFailure) ? existingGatewayFailure : {};
  const updates = isPlainObject(incomingGatewayFailure) ? incomingGatewayFailure : {};

  if (!isMeaningfulObject(updates)) {
    return isMeaningfulObject(current) ? cloneValue(current) : undefined;
  }

  return {
    ...cloneValue(current),
    ...cloneValue(updates),
    category: keepExistingWhenIncomingEmpty(current.category, updates.category),
    code: keepExistingWhenIncomingEmpty(current.code, updates.code),
    safeMessage: keepExistingWhenIncomingEmpty(current.safeMessage, updates.safeMessage),
    flow: keepExistingWhenIncomingEmpty(current.flow, updates.flow),
    requestedStep: keepExistingWhenIncomingEmpty(current.requestedStep, updates.requestedStep),
    systemsTraceNo: keepExistingWhenIncomingEmpty(
      current.systemsTraceNo,
      updates.systemsTraceNo
    ),
    referenceId: keepExistingWhenIncomingEmpty(current.referenceId, updates.referenceId),
    finalStatusIfNoReversal: keepExistingWhenIncomingEmpty(
      current.finalStatusIfNoReversal,
      updates.finalStatusIfNoReversal
    ),
    reversalAttempted:
      updates.reversalAttempted === undefined
        ? Boolean(current.reversalAttempted)
        : Boolean(updates.reversalAttempted || current.reversalAttempted),
    reversalApproved:
      updates.reversalApproved === undefined
        ? Boolean(current.reversalApproved)
        : Boolean(updates.reversalApproved || current.reversalApproved),
    correlationAvailable:
      updates.correlationAvailable === undefined
        ? Boolean(current.correlationAvailable)
        : Boolean(updates.correlationAvailable || current.correlationAvailable)
  };
}

function mergeThreeDSRawResponse(existingRawResponse = {}, updates = {}) {
  const current = isPlainObject(existingRawResponse) ? existingRawResponse : {};
  const incoming = isPlainObject(updates) ? updates : {};
  const next = cloneValue(current);

  const knownKeys = new Set([
    "latest",
    "flow",
    "step1",
    "step3",
    "step5",
    "threeDS",
    "reverse",
    "reverse_error",
    "gatewayFailure"
  ]);

  for (const [key, value] of Object.entries(incoming)) {
    if (knownKeys.has(key)) continue;
    if (isUsefulValue(value)) {
      next[key] = cloneValue(value);
    }
  }

  const mergedLatest = mergeLatest(current.latest, incoming.latest);
  if (mergedLatest !== undefined) {
    next.latest = mergedLatest;
  }

  const mergedFlow = keepExistingWhenIncomingEmpty(current.flow, incoming.flow);
  if (isUsefulValue(mergedFlow)) {
    next.flow = mergedFlow;
  }

  const mergedStep1 = mergeHistoricalStep(current.step1, incoming.step1);
  if (mergedStep1 !== undefined) {
    next.step1 = mergedStep1;
  }

  const mergedStep3 = mergeHistoricalStep(current.step3, incoming.step3);
  if (mergedStep3 !== undefined) {
    next.step3 = mergedStep3;
  }

  const mergedStep5 = mergeHistoricalStep(current.step5, incoming.step5);
  if (mergedStep5 !== undefined) {
    next.step5 = mergedStep5;
  }

  const mergedThreeDS = mergeThreeDSMetadata(current.threeDS, incoming.threeDS);
  if (isMeaningfulObject(mergedThreeDS)) {
    next.threeDS = mergedThreeDS;
  }

  const mergedReverse = preserveApprovedReverse(current.reverse, incoming.reverse);
  if (mergedReverse !== undefined) {
    next.reverse = mergedReverse;
  }

  const mergedReverseError = keepExistingWhenIncomingEmpty(
    current.reverse_error,
    incoming.reverse_error
  );
  if (isMeaningfulObject(mergedReverseError)) {
    next.reverse_error = mergedReverseError;
  }

  const mergedGatewayFailure = mergeGatewayFailure(
    current.gatewayFailure,
    incoming.gatewayFailure
  );
  if (mergedGatewayFailure !== undefined) {
    next.gatewayFailure = mergedGatewayFailure;
  }

  return next;
}

module.exports = {
  resolveThreeDSReturnUrl,
  resolveThreeDSStepUpUrl,
  buildThreeDSStep1Payload,
  buildThreeDSStepPayload,
  normalizeThreeDSStep,
  extractThreeDSData,
  evaluateThreeDSResult,
  buildThreeDSClientData,
  mergeThreeDSRawResponse
};
