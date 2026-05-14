const neonetService = require("../services/neonetService");
const { pool } = require("../src/db");

function sanitizeText(value, maxLen = 255) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLen);
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function shouldUseMock() {
  return normalizeBoolean(process.env.NEOPAY_USE_MOCK, false);
}

async function getNextSystemsTraceNo() {
  const result = await pool.query(
    `UPDATE payment_trace_counter
     SET last_value = CASE WHEN last_value >= 999999 THEN 1 ELSE last_value + 1 END,
         updated_at = NOW()
     WHERE id = 1
     RETURNING last_value`
  );

  const numeric = Number(result.rows[0]?.last_value || 1);
  return String(numeric).padStart(6, "0");
}

function formatAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Monto invalido");
  }
  return String(Math.round(numeric * 100));
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

function getPaymentStatus(code) {
  if (code === "00" || code === "10") return "approved";
  if (code === "91") return "timeout";
  return "rejected";
}

function getPaymentMessage(status) {
  if (status === "approved") return "Pago aprobado correctamente";
  if (status === "timeout") return "La transaccion excedio el tiempo de espera.";
  if (status === "reversed") return "Pago reversado correctamente";
  if (status === "cancelled") return "Pago anulado correctamente";
  return "Pago rechazado";
}

function extractNameParts(cardholderName) {
  const safeName = sanitizeText(cardholderName, 80);
  const parts = safeName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || ""
  };
}

function getShopperIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded.length) return forwarded[0];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "127.0.0.1";
}

function buildBasePayload() {
  return {
    MessageTypeId: "",
    ProcessingCode: "",
    SystemsTraceNo: "",
    TimeLocalTrans: getLocalTransactionTime(),
    DateLocalTrans: getLocalTransactionDate(),
    PosEntryMode: "012",
    Nii: "003",
    PosConditionCode: "00",
    AdditionalData: "",
    OrderInformation: "",
    FormatId: "1",
    Merchant: {
      TerminalId: process.env.NEOPAY_TERMINAL_ID,
      CardAcqId: process.env.NEOPAY_CARD_ACQ_ID
    },
    Card: {
      Type: "",
      PrimaryAcctNum: "",
      DateExpiration: "",
      Cvv2: "",
      Track2Data: "",
      CardTokenId: "",
      UniqueCodeofBeneciary: ""
    },
    Amount: {
      AmountTrans: "",
      AmountDiscount: "",
      RateDiscount: "",
      AdditionalAmounts: "",
      TaxDetail: []
    },
    PrivateUse60: { BatchNumber: "" },
    PrivateUse63: {
      LodgingFolioNumber14: "",
      NationalCard25: "",
      HostReferenceData31: "",
      TaxAmount1: ""
    },
    TokenManagement: { Type: "", ActionMethod: "" },
    Customer: {
      CustomerTokenId: "",
      FirstName: "",
      LastName: "",
      TaxId: "",
      IdentificationType: "",
      PersonalId: "",
      Email: "",
      PhoneNumber: ""
    },
    BillTo: {
      FirstName: "",
      LastName: "",
      Company: "",
      AddressOne: "",
      AddressTwo: "",
      Locality: "",
      AdministrativeArea: "",
      PostalCode: "",
      Country: "",
      Email: "",
      PhoneNumber: ""
    },
    ShipTo: {
      DefaultSt: "",
      FirstName: "",
      LastName: "",
      Company: "",
      AddressOne: "",
      AddressTwo: "",
      Locality: "",
      AdministrativeArea: "",
      PostalCode: "",
      Country: "",
      Email: "",
      PhoneNumber: "",
      ShippingAddressTokenId: ""
    },
    PaymentInstrument: { PaymentInstrumentTokenId: "" },
    CustomerPaymentInstrument: {
      CustomerPaymentInstrumentTokenId: "",
      DefaultCpi: ""
    },
    PayerAuthentication: {
      Step: "",
      UrlCommerce: "",
      ReferenceId: ""
    }
  };
}

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

function mapGatewayError(error) {
  if (error?.type === "NEONET_ERROR") {
    return {
      statusCode: 502,
      message: error?.data?.message || error?.message || "NeoNet rechazo la transaccion",
      detail: error?.data || null
    };
  }

  if (error?.type === "NETWORK_ERROR") {
    return {
      statusCode: 504,
      message: error?.message || "No se recibio respuesta de NeoNet",
      detail: error?.data || null
    };
  }

  return {
    statusCode: 500,
    message: error?.message || "Error procesando pago",
    detail: error?.data || null
  };
}

async function executeAutomaticReverse(originalPayload, shopperIP) {
  const reversePayload = buildBasePayload();

  reversePayload.MessageTypeId = "0400";
  reversePayload.ProcessingCode = "000000";
  reversePayload.SystemsTraceNo = await getNextSystemsTraceNo();
  reversePayload.Card.Type = originalPayload.Card.Type;
  reversePayload.Card.PrimaryAcctNum = originalPayload.Card.PrimaryAcctNum;
  reversePayload.Card.DateExpiration = originalPayload.Card.DateExpiration;
  reversePayload.Card.Cvv2 = originalPayload.Card.Cvv2;
  reversePayload.Amount.AmountTrans = originalPayload.Amount.AmountTrans;
  reversePayload.PrivateUse63.HostReferenceData31 =
    originalPayload.PrivateUse63.HostReferenceData31 || "";

  return dispatchPayment(reversePayload, shopperIP);
}

exports.createPayment = async (req, res) => {
  try {
    const {
      submission_id,
      amount,
      card_number,
      expiration_date,
      cvv,
      cardholder_name = ""
    } = req.body || {};

    if (!submission_id || !amount || !card_number || !expiration_date || !cvv) {
      return res.status(400).json({
        ok: false,
        message: "Faltan campos obligatorios"
      });
    }

    const sanitizedCardNumber = String(card_number || "").replace(/\D/g, "");
    const sanitizedExpiration = String(expiration_date || "").replace(/\D/g, "");
    const sanitizedCvv = String(cvv || "").replace(/\D/g, "");
    const cardBrand = getCardBrandLabel(sanitizedCardNumber);
    const maskedCard = maskCardNumber(sanitizedCardNumber);
    const nameParts = extractNameParts(cardholder_name);

    const payload = buildBasePayload();
    payload.MessageTypeId = "0200";
    payload.ProcessingCode = "000000";
    payload.SystemsTraceNo = await getNextSystemsTraceNo();
    payload.Card.Type = getCardType(sanitizedCardNumber);
    payload.Card.PrimaryAcctNum = sanitizedCardNumber;
    payload.Card.DateExpiration = sanitizedExpiration;
    payload.Card.Cvv2 = sanitizedCvv;
    payload.Amount.AmountTrans = formatAmount(amount);
    payload.Customer.FirstName = nameParts.firstName;
    payload.Customer.LastName = nameParts.lastName;
    payload.BillTo.FirstName = nameParts.firstName;
    payload.BillTo.LastName = nameParts.lastName;

    const shopperIP = getShopperIp(req);
    const neoResponse = await dispatchPayment(payload, shopperIP);
    let paymentStatus = getPaymentStatus(neoResponse.ResponseCode);

    if (paymentStatus === "timeout") {
      try {
        neoResponse.reverse = await executeAutomaticReverse(payload, shopperIP);
        if (isApproved(neoResponse.reverse?.ResponseCode)) {
          paymentStatus = "reversed";
        }
      } catch (reverseError) {
        neoResponse.reverse_error = mapGatewayError(reverseError);
      }
    }

    const transactionId =
      neoResponse.TransactionId ||
      neoResponse.TransactionIdentifier ||
      neoResponse.RetrievalRefNo ||
      neoResponse.SystemsTraceNo ||
      payload.SystemsTraceNo;

    const result = await pool.query(
      `INSERT INTO payments (
        submission_id,
        amount,
        status,
        transaction_id,
        authorization_code,
        reference_number,
        audit_number,
        masked_card,
        response_code,
        raw_response,
        cardholder_name,
        card_brand
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        submission_id,
        Number(amount),
        paymentStatus,
        transactionId,
        neoResponse.AuthIdResponse || null,
        neoResponse.RetrievalRefNo || null,
        neoResponse.SystemsTraceNo || payload.SystemsTraceNo,
        maskedCard,
        neoResponse.ResponseCode || null,
        neoResponse,
        sanitizeText(cardholder_name, 80) || null,
        cardBrand
      ]
    );

    return res.json({
      ok: true,
      status: paymentStatus,
      message: getPaymentMessage(paymentStatus),
      payment: result.rows[0],
      neo_response: neoResponse
    });

  } catch (error) {
    const gatewayError = mapGatewayError(error);
    console.error("createPayment:", error);
    return res.status(gatewayError.statusCode).json({
      ok: false,
      message: gatewayError.message,
      detail: gatewayError.detail
    });
  }
};


exports.cancelPayment = async (req, res) => {
  try {
    const payment = (
      await pool.query(`SELECT * FROM payments WHERE id = $1`, [req.params.id])
    ).rows[0];

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
    payload.Amount.AmountTrans = formatAmount(payment.amount);

    const shopperIP = getShopperIp(req);
    const neoResponse = await dispatchPayment(payload, shopperIP);

    if (!isApproved(neoResponse.ResponseCode)) {
      return res.status(400).json({
        ok: false,
        message: "Anulacion rechazada",
        neo_response: neoResponse
      });
    }

    const updated = await pool.query(
      `UPDATE payments
       SET status = 'cancelled',
           transaction_id = COALESCE($1, transaction_id),
           response_code = $2,
           raw_response = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        neoResponse.TransactionId || neoResponse.RetrievalRefNo || null,
        neoResponse.ResponseCode,
        neoResponse,
        req.params.id
      ]
    );

    return res.json({
      ok: true,
      status: "cancelled",
      message: getPaymentMessage("cancelled"),
      payment: updated.rows[0],
      neo_response: neoResponse
  
  });
  } catch (error) {
    const gatewayError = mapGatewayError(error);
    console.error("cancelPayment:", error);
    return res.status(gatewayError.statusCode).json({
      ok: false,
      message: gatewayError.message || "Error anulando pago",
      detail: gatewayError.detail
    });
  }
};


exports.reversePayment = async (req, res) => {
  try {
    const { card_number, expiration_date, cvv } = req.body || {};

    if (!card_number || !expiration_date || !cvv) {
      return res.status(400).json({
        ok: false,
        message: "Datos de tarjeta requeridos para reversa"
      });
    }

    const payment = (
      await pool.query(`SELECT * FROM payments WHERE id = $1`, [req.params.id])
    ).rows[0];

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

    const sanitizedCardNumber = String(card_number || "").replace(/\D/g, "");
    const sanitizedExpiration = String(expiration_date || "").replace(/\D/g, "");
    const sanitizedCvv = String(cvv || "").replace(/\D/g, "");

    const payload = buildBasePayload();
    payload.MessageTypeId = "0400";
    payload.ProcessingCode = "000000";
    payload.SystemsTraceNo = await getNextSystemsTraceNo();
    payload.Card.Type = getCardType(sanitizedCardNumber);
    payload.Card.PrimaryAcctNum = sanitizedCardNumber;
    payload.Card.DateExpiration = sanitizedExpiration;
    payload.Card.Cvv2 = sanitizedCvv;
    payload.Amount.AmountTrans = formatAmount(payment.amount);
    payload.PrivateUse63.HostReferenceData31 = payment.reference_number || "";

    const shopperIP = getShopperIp(req);
    const neoResponse = await dispatchPayment(payload, shopperIP);

    if (!isApproved(neoResponse.ResponseCode)) {
      return res.status(400).json({
        ok: false,
        message: "Reversa rechazada",
        neo_response: neoResponse
      });
    }

    const updated = await pool.query(
      `UPDATE payments
       SET status = 'reversed',
           transaction_id = COALESCE($1, transaction_id),
           response_code = $2,
           raw_response = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        neoResponse.TransactionId || neoResponse.RetrievalRefNo || null,
        neoResponse.ResponseCode,
        neoResponse,
        req.params.id
      ]
    );

    return res.json({
      ok: true,
      status: "reversed",
      message: getPaymentMessage("reversed"),
      payment: updated.rows[0],
      neo_response: neoResponse
    });
   } catch (error) {
    const gatewayError = mapGatewayError(error);
    console.error("reversePayment:", error);
    return res.status(gatewayError.statusCode).json({
      ok: false,
      message: gatewayError.message || "Error ejecutando reversa",
      detail: gatewayError.detail
    });
  }
};


exports.getVoucher = async (req, res) => {
  try {
    const payment = (
      await pool.query(`SELECT * FROM payments WHERE id = $1`, [req.params.id])
    ).rows[0];

    if (!payment) {
      return res.status(404).json({
        ok: false,
        message: "Pago no encontrado"
      });
    }

    return res.json({
      ok: true,
      voucher: {
        payment_method: "NeoNet",
        transaction_date: payment.created_at,
        amount: payment.amount,
        reference_number: payment.reference_number,
        authorization_code: payment.authorization_code,
        audit_number: payment.audit_number,
        masked_card: payment.masked_card,
        cardholder_name: payment.cardholder_name || null,
        card_brand: payment.card_brand || null,
        transaction_id: payment.transaction_id || null,
        status: payment.status
      }
    });
  } catch (error) {
    console.error("getVoucher:", error);
    return res.status(500).json({
      ok: false,
      message: "Error obteniendo voucher"
    });
  }
};
