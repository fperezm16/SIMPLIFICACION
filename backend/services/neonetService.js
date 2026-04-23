const axios = require("axios");

const NEOPAY_URL = process.env.NEOPAY_URL;
const MERCHANT_USER = process.env.NEOPAY_MERCHANT_USER;
const MERCHANT_PASSWD = process.env.NEOPAY_MERCHANT_PASSWD;
const PAYMENTGW_IP = process.env.NEOPAY_PAYMENTGW_IP;
const MERCHANT_SERVER_IP = process.env.NEOPAY_MERCHANT_SERVER_IP;

// Valida variables necesarias
function validateConfig() {
  if (!NEOPAY_URL) throw new Error("NEOPAY_URL no configurado");
  if (!MERCHANT_USER) throw new Error("NEOPAY_MERCHANT_USER no configurado");
  if (!MERCHANT_PASSWD) throw new Error("NEOPAY_MERCHANT_PASSWD no configurado");
  if (!PAYMENTGW_IP) throw new Error("NEOPAY_PAYMENTGW_IP no configurado");
  if (!MERCHANT_SERVER_IP) throw new Error("NEOPAY_MERCHANT_SERVER_IP no configurado");
}

// Construye headers requeridos por NeoNet
function buildHeaders(shopperIP) {
  return {
    "Content-Type": "application/json",
    MerchantUser: MERCHANT_USER,
    MerchantPasswd: MERCHANT_PASSWD,
    PaymentgwIP: PAYMENTGW_IP,
    MerchantServerIP: MERCHANT_SERVER_IP,
    ShopperIP: shopperIP || "127.0.0.1"
  };
}

// Envía transacción a NeoNet
async function sendTransaction(payload, shopperIP) {
  try {
    validateConfig();

    const url = `${NEOPAY_URL}/api/AuthorizationPaymentCommerce`;

    const response = await axios.post(
      url,
      payload,
      {
        headers: buildHeaders(shopperIP),
        timeout: 60000
      }
    );

    return response.data;

  } catch (error) {
    // Error con respuesta de NeoNet
    if (error.response) {
      console.error("NeoNet error response:", error.response.data);

      throw {
        type: "NEONET_ERROR",
        status: error.response.status,
        data: error.response.data
      };
    }

    // Error de red o timeout
    if (error.request) {
      console.error("NeoNet sin respuesta (timeout o red)");

      throw {
        type: "NETWORK_ERROR",
        message: "No se recibió respuesta de NeoNet"
      };
    }

    // Error interno
    console.error("Error interno NeoNet:", error.message);

    throw {
      type: "INTERNAL_ERROR",
      message: error.message
    };
  }
}

module.exports = {
  sendTransaction
};