const DEFAULT_PROVIDER_URL = "https://signer.infile.com/api/v3/firma_documentos/firmar_documento";
const DEFAULT_PROVIDER_NAME = "prisma";
const PDF_HEADER = "%PDF";

function sanitizeText(value, maxLen = 255) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLen);
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parseInteger(value, fallback) {
  const numeric = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseOptionalBoolean(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return normalizeBoolean(value, false);
}

function normalizeRequiredSignatureCoordinates(value) {
  const raw = sanitizeText(value, 120);
  const parts = raw.split(/\s+/).map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isFinite(part)) ||
    parts[2] <= parts[0] ||
    parts[3] <= parts[1]
  ) {
    throw new Error("Debes colocar manualmente una firma valida sobre el documento.");
  }
  return parts.join(" ");
}

function normalizeRequiredSignaturePage(value) {
  const raw = sanitizeText(value, 40);
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new Error("Debes seleccionar una pagina valida para la firma.");
  }
  return raw;
}

// Centraliza la configuracion del proveedor para no dispersar defaults.
function getConfig() {
  const providerUrl = sanitizeText(
    process.env.SIGNER_PROVIDER_URL ||
    process.env.PRISMA_SIGN_URL ||
    process.env.PRISMA_SIGNER_URL ||
    DEFAULT_PROVIDER_URL,
    500
  );
  const accessKey = sanitizeText(
    process.env.SIGNER_ACCESS_KEY ||
    process.env.PRISMA_LLAVE_ACCESO ||
    process.env.PRISMA_ACCESS_KEY,
    500
  );

  if (!providerUrl) {
    throw new Error("SIGNER_PROVIDER_URL no esta configurado.");
  }
  if (!accessKey) {
    throw new Error("SIGNER_ACCESS_KEY no esta configurado.");
  }

  return {
    providerName: sanitizeText(
      process.env.SIGNER_PROVIDER_NAME || DEFAULT_PROVIDER_NAME,
      80
    ) || DEFAULT_PROVIDER_NAME,
    providerUrl,
    accessKey,
    requestTimeoutMs: parseInteger(process.env.SIGNER_TIMEOUT_MS, 60000),
    sync: normalizeBoolean(process.env.SIGNER_SYNC, true),
    closeRequest: normalizeBoolean(process.env.SIGNER_CLOSE, false),
    defaultConcept: sanitizeText(process.env.SIGNER_DEFAULT_CONCEPT, 180) || "Firma de documento",
    defaultPlace: sanitizeText(process.env.SIGNER_DEFAULT_PLACE, 180) || "Guatemala, Guatemala",
    defaultRequestType: sanitizeText(process.env.SIGNER_REQUEST_TYPE, 80) || "PDF Especial",
    defaultAppearance: sanitizeText(process.env.SIGNER_APPEARANCE, 80) || "GRAPHIC_AND_DESCRIPTION",
    defaultFontSize: sanitizeText(process.env.SIGNER_FONT_SIZE, 12) || "-2",
    showDn: parseOptionalBoolean(process.env.SIGNER_SHOW_DN),
    rubricBase64: sanitizeText(
      process.env.SIGNER_RUBRIC_BASE64 ||
      process.env.SIGNER_RUBRIC,
      2_000_000
    ),
    callbackUrl: sanitizeText(process.env.SIGNER_CALLBACK_URL, 500)
  };
}

// Permite validar el entorno antes de una firma sin revelar secretos.
function getConfigDiagnostics() {
  const providerUrl = sanitizeText(
    process.env.SIGNER_PROVIDER_URL ||
    process.env.PRISMA_SIGN_URL ||
    process.env.PRISMA_SIGNER_URL ||
    DEFAULT_PROVIDER_URL,
    500
  );
  const accessKey = sanitizeText(
    process.env.SIGNER_ACCESS_KEY ||
    process.env.PRISMA_LLAVE_ACCESO ||
    process.env.PRISMA_ACCESS_KEY,
    500
  );
  const rubricBase64 = sanitizeText(
    process.env.SIGNER_RUBRIC_BASE64 || process.env.SIGNER_RUBRIC,
    2_000_000
  );

  return {
    ok: Boolean(providerUrl && accessKey),
    provider: sanitizeText(process.env.SIGNER_PROVIDER_NAME || DEFAULT_PROVIDER_NAME, 80) || DEFAULT_PROVIDER_NAME,
    checks: {
      provider_url: Boolean(providerUrl),
      access_key: Boolean(accessKey),
      rubric: Boolean(rubricBase64)
    },
    settings: {
      sync: normalizeBoolean(process.env.SIGNER_SYNC, true),
      close_request: normalizeBoolean(process.env.SIGNER_CLOSE, false),
      callback_configured: Boolean(sanitizeText(process.env.SIGNER_CALLBACK_URL, 500)),
      show_dn: parseOptionalBoolean(process.env.SIGNER_SHOW_DN),
      appearance: sanitizeText(process.env.SIGNER_APPEARANCE, 80) || "GRAPHIC_AND_DESCRIPTION",
      request_type: sanitizeText(process.env.SIGNER_REQUEST_TYPE, 80) || "PDF Especial"
    }
  };
}

// Usa timeout nativo cuando la version de Node lo permite.
function createTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

function bufferLooksLikePdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, 4).toString("utf8") === PDF_HEADER;
}

// Algunos proveedores devuelven el PDF en base64 dentro de texto o JSON.
function decodePossiblePdfBase64(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const cleaned = raw.includes(",") ? raw.split(",").pop() : raw;
  const compact = cleaned.replace(/\s+/g, "");
  if (!compact || compact.length < 64) return null;
  try {
    const buffer = Buffer.from(compact, "base64");
    return bufferLooksLikePdf(buffer) ? buffer : null;
  } catch {
    return null;
  }
}

function extractFilenameFromDisposition(disposition = "") {
  const match = String(disposition || "").match(/filename="?([^"]+)"?/i);
  return match ? sanitizeText(match[1], 180) : "";
}

// Recorre respuestas anidadas sin asumir una estructura fija del proveedor.
function collectNestedValues(source, entries = [], path = "", depth = 0) {
  if (depth > 6 || source === null || source === undefined) return entries;
  if (typeof source === "string" || typeof source === "number" || typeof source === "boolean") {
    entries.push({ path, value: source });
    return entries;
  }
  if (Buffer.isBuffer(source)) {
    entries.push({ path, value: source.toString("base64") });
    return entries;
  }
  if (Array.isArray(source)) {
    source.forEach((item, index) => collectNestedValues(item, entries, `${path}[${index}]`, depth + 1));
    return entries;
  }
  if (typeof source === "object") {
    for (const [key, value] of Object.entries(source)) {
      const nextPath = path ? `${path}.${key}` : key;
      collectNestedValues(value, entries, nextPath, depth + 1);
    }
  }
  return entries;
}

// Guarda solo una vista segura de la respuesta para auditoria y debugging.
function sanitizeProviderPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const entries = collectNestedValues(payload);
  const preview = {};
  for (const entry of entries) {
    const key = entry.path || "value";
    const lowered = key.toLowerCase();
    if (
      lowered.includes("archivo") ||
      lowered.includes("documento") ||
      lowered.includes("rubrica") ||
      lowered.includes("base64") ||
      lowered.includes("password")
    ) {
      continue;
    }
    const value = typeof entry.value === "string"
      ? sanitizeText(entry.value, 240)
      : entry.value;
    if (value === "") continue;
    preview[key] = value;
    if (Object.keys(preview).length >= 20) break;
  }
  return {
    keys: Object.keys(payload).slice(0, 20),
    preview
  };
}

// Busca un PDF en cualquier propiedad anidada serializada como base64.
function extractPdfFromPayload(payload) {
  const entries = collectNestedValues(payload);
  for (const entry of entries) {
    const decoded = decodePossiblePdfBase64(entry.value);
    if (decoded) return decoded;
  }
  return null;
}

// Intenta rescatar un identificador externo util para trazabilidad.
function extractExternalId(payload) {
  if (!payload || typeof payload !== "object") return null;
  const entries = collectNestedValues(payload);
  for (const entry of entries) {
    if (!/(^|\.)(id|uuid|folio|correlativo|transaccion|solicitud)(\.|$)/i.test(entry.path)) {
      continue;
    }
    const value = entry.value;
    if (typeof value === "string" || typeof value === "number") {
      const normalized = sanitizeText(value, 120);
      if (normalized) return normalized;
    }
  }
  return null;
}

// Resume lo enviado al proveedor sin persistir datos sensibles.
function buildRequestPayloadSummary({
  concept,
  place,
  coordinates,
  pages,
  appearance,
  requestType,
  fontSize,
  closeRequest,
  sync
}) {
  return {
    concepto: concept,
    lugar: place,
    coordinates,
    pages,
    appearance,
    request_type: requestType,
    font_size: fontSize,
    close_request: Boolean(closeRequest),
    sync: Boolean(sync)
  };
}

function buildResponsePayloadSummary(config, contentType, responseType, payload, externalId = null) {
  return {
    provider: config.providerName,
    response_type: responseType,
    content_type: contentType || "",
    external_id: externalId,
    payload: sanitizeProviderPayload(payload)
  };
}

function extractProviderMessage(payload) {
  if (!payload || typeof payload !== "object") return "";
  const candidates = [
    payload?.descripcion,
    payload?.message,
    payload?.mensaje,
    payload?.error,
    payload?.detalle,
    payload?.detail,
    payload?.codigo
  ];
  for (const candidate of candidates) {
    const normalized = sanitizeText(candidate, 400);
    if (normalized) return normalized;
  }
  return "";
}

// Orquesta la llamada multipart al proveedor y normaliza su respuesta.
async function signPdfWithProvider({
  pdfBuffer,
  filename,
  signerEmail,
  signerPassword,
  concept,
  place,
  coordinates,
  pages,
  appearance,
  requestType,
  fontSize,
  closeRequest
}) {
  if (!Buffer.isBuffer(pdfBuffer) || !pdfBuffer.length) {
    throw new Error("No se recibio un PDF valido para firmar.");
  }

  const config = getConfig();
  const safeEmail = sanitizeText(signerEmail, 320).toLowerCase();
  const safePassword = sanitizeText(signerPassword, 320);
  if (!safeEmail) {
    throw new Error("No se encontro el correo del firmante.");
  }
  if (!safePassword) {
    throw new Error("La password de firma es obligatoria.");
  }

  const resolvedConcept = sanitizeText(concept, 180) || config.defaultConcept;
  const resolvedPlace = sanitizeText(place, 180) || config.defaultPlace;
  const resolvedCoordinates = normalizeRequiredSignatureCoordinates(coordinates);
  const resolvedPages = normalizeRequiredSignaturePage(pages);
  const resolvedAppearance = sanitizeText(appearance, 80) || config.defaultAppearance;
  const resolvedRequestType = sanitizeText(requestType, 80) || config.defaultRequestType;
  const resolvedFontSize = sanitizeText(fontSize, 12) || config.defaultFontSize;
  const shouldClose = closeRequest === undefined ? config.closeRequest : normalizeBoolean(closeRequest, config.closeRequest);

  // El proveedor espera multipart/form-data con los nombres exactos de Postman.
  const formData = new FormData();
  formData.append("llave_acceso", config.accessKey);
  formData.append("email", safeEmail);
  formData.append("password_firma", safePassword);
  formData.append("solicitud_firma[es_sincrono]", config.sync ? "true" : "false");
  formData.append("solicitud_firma[concepto]", resolvedConcept);
  formData.append("solicitud_firma[lugar]", resolvedPlace);
  formData.append("solicitud_firma[tipo_solicitud]", resolvedRequestType);
  formData.append("solicitud_firma[apariencia_firma]", resolvedAppearance);
  if (config.showDn !== undefined) {
    formData.append("solicitud_firma[show_dn]", config.showDn ? "true" : "false");
  }
  if (config.rubricBase64) {
    formData.append("solicitud_firma[rubrica]", config.rubricBase64);
  }
  formData.append(
    "solicitud_firma[archivo]",
    new Blob([pdfBuffer], { type: "application/pdf" }),
    sanitizeText(filename, 180) || "documento.pdf"
  );
  formData.append("solicitud_firma[url_respuesta]", config.callbackUrl);
  formData.append("solicitud_firma[cerrar]", shouldClose ? "true" : "false");
  formData.append("solicitud_firma[coordenadas][][paginas]", resolvedPages);
  formData.append("solicitud_firma[coordenadas][][coordenadas]", resolvedCoordinates);
  formData.append("solicitud_firma[font_size]", resolvedFontSize);

  const response = await fetch(config.providerUrl, {
    method: "POST",
    body: formData,
    signal: createTimeoutSignal(config.requestTimeoutMs)
  });

  const contentType = sanitizeText(response.headers.get("content-type"), 120).toLowerCase();
  const disposition = response.headers.get("content-disposition") || "";
  const responseBuffer = Buffer.from(await response.arrayBuffer());

  // Si el proveedor falla, intentamos propagar el mensaje mas claro disponible.
  if (!response.ok) {
    let message = `El proveedor de firma respondio con estado ${response.status}.`;
    if (contentType.includes("json")) {
      let payload = null;
      try {
        payload = JSON.parse(responseBuffer.toString("utf8"));
      } catch {
        // Ignore parse failures and keep the generic error.
      }
      if (payload) {
        const detail = extractProviderMessage(payload);
        if (detail) message = detail;
        const error = new Error(message);
        error.responsePayloadSummary = buildResponsePayloadSummary(
          config,
          contentType,
          "json_error",
          payload,
          extractExternalId(payload)
        );
        throw error;
      }
    } else {
      const detail = sanitizeText(responseBuffer.toString("utf8"), 400);
      if (detail) message = detail;
    }
    throw new Error(message);
  }

  const filenameFromHeaders = extractFilenameFromDisposition(disposition);
  // Camino feliz: algunos proveedores responden directamente el PDF binario.
  if (contentType.includes("pdf") || bufferLooksLikePdf(responseBuffer)) {
    return {
      providerName: config.providerName,
      signedPdfBuffer: responseBuffer,
      filename: filenameFromHeaders || sanitizeText(filename, 180) || "documento-firmado.pdf",
      requestPayloadSummary: buildRequestPayloadSummary({
        concept: resolvedConcept,
        place: resolvedPlace,
        coordinates: resolvedCoordinates,
        pages: resolvedPages,
        appearance: resolvedAppearance,
        requestType: resolvedRequestType,
        fontSize: resolvedFontSize,
        closeRequest: shouldClose,
        sync: config.sync
      }),
      responsePayloadSummary: {
        provider: config.providerName,
        response_type: "pdf",
        content_type: contentType || "application/pdf"
      },
      externalId: null
    };
  }

  let payload = null;
  try {
    payload = JSON.parse(responseBuffer.toString("utf8"));
  } catch {
    // Fallback para respuestas texto plano con el PDF codificado en base64.
    const decodedBuffer = decodePossiblePdfBase64(responseBuffer.toString("utf8"));
    if (decodedBuffer) {
      return {
        providerName: config.providerName,
        signedPdfBuffer: decodedBuffer,
        filename: filenameFromHeaders || sanitizeText(filename, 180) || "documento-firmado.pdf",
        requestPayloadSummary: buildRequestPayloadSummary({
          concept: resolvedConcept,
          place: resolvedPlace,
          coordinates: resolvedCoordinates,
          pages: resolvedPages,
          appearance: resolvedAppearance,
          requestType: resolvedRequestType,
          fontSize: resolvedFontSize,
          closeRequest: shouldClose,
          sync: config.sync
        }),
        responsePayloadSummary: {
          provider: config.providerName,
          response_type: "base64",
          content_type: contentType || "text/plain"
        },
        externalId: null
      };
    }
    throw new Error("El proveedor de firma no devolvio un PDF firmable.");
  }

  // Fallback para respuestas JSON donde el PDF viene embebido en alguna propiedad.
  const extractedPdf = extractPdfFromPayload(payload);
  if (!extractedPdf) {
    const message = extractProviderMessage(payload) || "El proveedor de firma respondio sin un PDF firmado.";
    const error = new Error(message);
    error.responsePayloadSummary = buildResponsePayloadSummary(
      config,
      contentType,
      "json_without_pdf",
      payload,
      extractExternalId(payload)
    );
    throw error;
  }

  return {
    providerName: config.providerName,
    signedPdfBuffer: extractedPdf,
    filename: filenameFromHeaders || sanitizeText(filename, 180) || "documento-firmado.pdf",
    requestPayloadSummary: buildRequestPayloadSummary({
      concept: resolvedConcept,
      place: resolvedPlace,
      coordinates: resolvedCoordinates,
      pages: resolvedPages,
      appearance: resolvedAppearance,
      requestType: resolvedRequestType,
      fontSize: resolvedFontSize,
      closeRequest: shouldClose,
      sync: config.sync
    }),
    responsePayloadSummary: buildResponsePayloadSummary(
      config,
      contentType || "application/json",
      "json",
      payload,
      extractExternalId(payload)
    ),
    externalId: extractExternalId(payload)
  };
}

module.exports = {
  signPdfWithProvider,
  getConfigDiagnostics,
  __private: {
    getConfig,
    parseOptionalBoolean,
    normalizeRequiredSignatureCoordinates,
    normalizeRequiredSignaturePage
  }
};
