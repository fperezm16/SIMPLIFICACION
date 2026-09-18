const axios = require("axios");
const {
  buildAxiosErrorLog,
  buildPaymentLogSummary,
  hasUsableResponseCode
} = require("./paymentHelpersService");

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRuntimeConfig() {
  return {
    NEOPAY_URL: process.env.NEOPAY_URL,
    MERCHANT_USER: process.env.NEOPAY_MERCHANT_USER,
    MERCHANT_PASSWD: process.env.NEOPAY_MERCHANT_PASSWD,
    PAYMENTGW_IP: process.env.NEOPAY_PAYMENTGW_IP,
    MERCHANT_SERVER_IP: process.env.NEOPAY_MERCHANT_SERVER_IP
  };
}

function validateConfig() {
  const {
    NEOPAY_URL,
    MERCHANT_USER,
    MERCHANT_PASSWD,
    PAYMENTGW_IP,
    MERCHANT_SERVER_IP
  } = getRuntimeConfig();

  if (!NEOPAY_URL) throw new Error("NEOPAY_URL no configurado");
  if (!MERCHANT_USER) throw new Error("NEOPAY_MERCHANT_USER no configurado");
  if (!MERCHANT_PASSWD) throw new Error("NEOPAY_MERCHANT_PASSWD no configurado");
  if (!PAYMENTGW_IP) throw new Error("NEOPAY_PAYMENTGW_IP no configurado");
  if (!MERCHANT_SERVER_IP) throw new Error("NEOPAY_MERCHANT_SERVER_IP no configurado");
}

function getConfigDiagnostics() {
  const {
    NEOPAY_URL,
    MERCHANT_USER,
    MERCHANT_PASSWD,
    PAYMENTGW_IP,
    MERCHANT_SERVER_IP
  } = getRuntimeConfig();

  const checks = {
    NEOPAY_URL: Boolean(NEOPAY_URL),
    NEOPAY_MERCHANT_USER: Boolean(MERCHANT_USER),
    NEOPAY_MERCHANT_PASSWD: Boolean(MERCHANT_PASSWD),
    NEOPAY_PAYMENTGW_IP: Boolean(PAYMENTGW_IP),
    NEOPAY_MERCHANT_SERVER_IP: Boolean(MERCHANT_SERVER_IP)
  };

  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    endpoint: NEOPAY_URL ? `${NEOPAY_URL}/api/AuthorizationPaymentCommerce` : null
  };
}

function buildHeaders(shopperIP) {
  const {
    MERCHANT_USER,
    MERCHANT_PASSWD,
    PAYMENTGW_IP,
    MERCHANT_SERVER_IP
  } = getRuntimeConfig();

  return {
    "Content-Type": "application/json",
    MerchantUser: MERCHANT_USER,
    MerchantPasswd: MERCHANT_PASSWD,
    PaymentgwIP: PAYMENTGW_IP,
    MerchantServerIP: MERCHANT_SERVER_IP,
    ShopperIP: shopperIP || "127.0.0.1"
  };
}

function isLikelyNeoNetResponseBody(data) {
  if (!isPlainObject(data)) return false;

  const responseCode = String(data.ResponseCode || "").trim();
  if (!hasUsableResponseCode(responseCode)) {
    return false;
  }

  return Boolean(
    String(data.MessageTypeId || "").trim() ||
    String(data.ProcessingCode || "").trim() ||
    String(data.SystemsTraceNo || "").trim() ||
    String(data.RetrievalRefNo || "").trim() ||
    String(data.AuthIdResponse || "").trim() ||
    String(data.AmountTrans || "").trim() ||
    String(data.TypeOperation || "").trim() ||
    isPlainObject(data.Merchant) ||
    isPlainObject(data.PrivateUse63) ||
    isPlainObject(data.PayerAuthentication) ||
    data.OrderInformation !== undefined ||
    data.AdditionalData !== undefined
  );
}

async function sendTransaction(payload, shopperIP) {
  const startedAt = Date.now();
  try {
    validateConfig();
    const { NEOPAY_URL } = getRuntimeConfig();

    const url = `${NEOPAY_URL}/api/AuthorizationPaymentCommerce`;
    const response = await axios.post(url, payload, {
      headers: buildHeaders(shopperIP),
      timeout: 60000
    });

    return response.data;
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    if (error.response) {
      if (isLikelyNeoNetResponseBody(error.response?.data)) {
        return error.response.data;
      }

      console.error(
        "NeoNet error response:",
        buildAxiosErrorLog(error, {
          service: "neonetService",
          phase: "sendTransaction.response_error",
          durationMs
        })
      );

      throw {
        type: "NEONET_HTTP_ERROR",
        status: error.response.status,
        data: error.response.data,
        code: error.code || null,
        message: error.message,
        hadRequest: true,
        hadResponse: true
      };
    }

    if (error.request) {
      console.error(
        "NeoNet sin respuesta (timeout o red):",
        buildAxiosErrorLog(error, {
          service: "neonetService",
          phase: "sendTransaction.network_error",
          durationMs
        })
      );

      throw {
        type: "NETWORK_ERROR",
        message: "No se recibio respuesta de NeoNet",
        code: error.code || null,
        hadRequest: true,
        hadResponse: false
      };
    }

    console.error(
      "Error interno NeoNet:",
      buildPaymentLogSummary({
        service: "neonetService",
        phase: "sendTransaction.internal_error",
        errorType: error?.type || error?.name || "INTERNAL_ERROR",
        durationMs,
        status: "failed"
      })
    );

    throw {
      type: "INTERNAL_ERROR",
      message: error.message,
      code: error.code || null,
      hadRequest: false,
      hadResponse: false
    };
  }
}

module.exports = {
  getConfigDiagnostics,
  isLikelyNeoNetResponseBody,
  sendTransaction,
  validateConfig
};
