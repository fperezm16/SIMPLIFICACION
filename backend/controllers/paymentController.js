const neonetService = require("../services/neonetService");
const { pool } = require("../src/db");

// Genera número de traza ISO
function generateSystemsTraceNo() {
  const random = Math.floor(Math.random() * 999999) + 1;
  return String(random).padStart(6, "0");
}

// Formatea monto a centavos
function formatAmount(amount) {
  const numeric = Number(amount);
  if (Number.isNaN(numeric)) throw new Error("Monto inválido");
  return String(Math.round(numeric * 100));
}

// Detecta tipo de tarjeta
function getCardType(cardNumber) {
  if (/^4/.test(cardNumber)) return "001";
  if (/^(5[1-5]|2[2-7])/.test(cardNumber)) return "002";
  return "";
}

// Hora local HHMMSS
function getLocalTransactionTime() {
  const now = new Date();
  return now.toTimeString().slice(0, 8).replace(/:/g, "");
}

// Fecha local MMDD
function getLocalTransactionDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${month}${day}`;
}

// Valida respuesta aprobada
function isApproved(code) {
  return code === "00" || code === "10";
}

// Crear pago
exports.createPayment = async (req, res) => {
  try {
    const { submission_id, amount, card_number, expiration_date, cvv } = req.body || {};

    if (!submission_id || !amount || !card_number || !expiration_date || !cvv) {
      return res.status(400).json({ ok: false, message: "Faltan campos obligatorios" });
    }

    const payload = {
      MessageTypeId: "0200",
      ProcessingCode: "000000",
      SystemsTraceNo: generateSystemsTraceNo(),
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
        Type: getCardType(card_number),
        PrimaryAcctNum: card_number,
        DateExpiration: expiration_date,
        Cvv2: cvv,
        Track2Data: "",
        CardTokenId: "",
        UniqueCodeofBeneciary: ""
      },
      Amount: {
        AmountTrans: formatAmount(amount),
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
      }
    };

    const useMock = process.env.NEOPAY_USE_MOCK === "true";
    let neoResponse;

    if (useMock) {
      neoResponse = {
        ResponseCode: "00",
        RetrievalRefNo: "123456789012",
        AuthIdResponse: "ABC123",
        SystemsTraceNo: payload.SystemsTraceNo,
        AmountTrans: payload.Amount.AmountTrans
      };
    } else {
      const shopperIP = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
      neoResponse = await neonetService.sendTransaction(payload, shopperIP);
    }

    const approved = isApproved(neoResponse.ResponseCode);

    const paymentResult = await pool.query(
      `INSERT INTO payments (
        submission_id,
        amount,
        status,
        authorization_code,
        reference_number,
        audit_number,
        response_code,
        raw_response
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        submission_id,
        Number(amount),
        approved ? "approved" : "rejected",
        neoResponse.AuthIdResponse || null,
        neoResponse.RetrievalRefNo || null,
        neoResponse.SystemsTraceNo || null,
        neoResponse.ResponseCode || null,
        neoResponse
      ]
    );

    return res.json({
      ok: true,
      status: approved ? "approved" : "rejected",
      payment: paymentResult.rows[0],
      neo_response: neoResponse
    });

  } catch (error) {
    console.error("createPayment error:", error);
    return res.status(500).json({ ok: false, message: "Error procesando pago" });
  }
};

// Anular pago
exports.cancelPayment = async (req, res) => {
  try {
    const paymentId = req.params.id;

    const { rows, rowCount } = await pool.query(
      `SELECT * FROM payments WHERE id = $1`,
      [paymentId]
    );

    if (!rowCount) {
      return res.status(404).json({ ok: false, message: "Pago no encontrado" });
    }

    const payment = rows[0];

    if (payment.status === "cancelled") {
      return res.status(400).json({ ok: false, message: "El pago ya fue anulado" });
    }

    const payload = {
      MessageTypeId: "0200",
      ProcessingCode: "020000",
      SystemsTraceNo: generateSystemsTraceNo(),
      TimeLocalTrans: getLocalTransactionTime(),
      DateLocalTrans: getLocalTransactionDate(),
      PosEntryMode: "012",
      Nii: "003",
      PosConditionCode: "00",
      Merchant: {
        TerminalId: process.env.NEOPAY_TERMINAL_ID,
        CardAcqId: process.env.NEOPAY_CARD_ACQ_ID
      }
    };

    const useMock = process.env.NEOPAY_USE_MOCK === "true";
    let neoResponse;

    if (useMock) {
      neoResponse = {
        ResponseCode: "00",
        SystemsTraceNo: payload.SystemsTraceNo
      };
    } else {
      const shopperIP = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
      neoResponse = await neonetService.sendTransaction(payload, shopperIP);
    }

    if (!isApproved(neoResponse.ResponseCode)) {
      return res.status(400).json({
        ok: false,
        message: "Anulación rechazada",
        neo_response: neoResponse
      });
    }

    const updated = await pool.query(
      `UPDATE payments
       SET status = 'cancelled',
           response_code = $1,
           raw_response = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [neoResponse.ResponseCode, neoResponse, paymentId]
    );

    return res.json({
      ok: true,
      status: "cancelled",
      payment: updated.rows[0],
      neo_response: neoResponse
    });

  } catch (error) {
    console.error("cancelPayment error:", error);
    return res.status(500).json({ ok: false, message: "Error anulando pago" });
  }
};

// Reversar pago
exports.reversePayment = async (req, res) => {
  try {
    const paymentId = req.params.id;

    const { rows, rowCount } = await pool.query(
      `SELECT * FROM payments WHERE id = $1`,
      [paymentId]
    );

    if (!rowCount) {
      return res.status(404).json({ ok: false, message: "Pago no encontrado" });
    }

    const payment = rows[0];

    if (payment.status === "reversed") {
      return res.status(400).json({ ok: false, message: "Ya fue revertido" });
    }

    const payload = {
      MessageTypeId: "0400",
      ProcessingCode: "000000",
      SystemsTraceNo: generateSystemsTraceNo(),
      TimeLocalTrans: getLocalTransactionTime(),
      DateLocalTrans: getLocalTransactionDate(),
      PosEntryMode: "012",
      Nii: "003",
      Merchant: {
        TerminalId: process.env.NEOPAY_TERMINAL_ID,
        CardAcqId: process.env.NEOPAY_CARD_ACQ_ID
      },
      Amount: {
        AmountTrans: formatAmount(payment.amount)
      }
    };

    const useMock = process.env.NEOPAY_USE_MOCK === "true";
    let neoResponse;

    if (useMock) {
      neoResponse = { ResponseCode: "00" };
    } else {
      const shopperIP = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
      neoResponse = await neonetService.sendTransaction(payload, shopperIP);
    }

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
           response_code = $1,
           raw_response = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [neoResponse.ResponseCode, neoResponse, paymentId]
    );

    return res.json({
      ok: true,
      status: "reversed",
      payment: updated.rows[0],
      neo_response: neoResponse
    });

  } catch (error) {
    console.error("reversePayment error:", error);
    return res.status(500).json({ ok: false, message: "Error ejecutando reversa" });
  }
};

// Obtener voucher
exports.getVoucher = async (req, res) => {
  try {
    const paymentId = req.params.id;

    const { rows, rowCount } = await pool.query(
      `SELECT * FROM payments WHERE id = $1`,
      [paymentId]
    );

    if (!rowCount) {
      return res.status(404).json({ ok: false, message: "Pago no encontrado" });
    }

    const p = rows[0];

    return res.json({
      ok: true,
      voucher: {
        payment_method: "NeoNet",
        transaction_date: p.created_at,
        amount: p.status === "cancelled" ? `-${p.amount}` : p.amount,
        masked_card: p.masked_card || "XXXX-XXXX-XXXX-XXXX",
        reference_number: p.reference_number,
        authorization_code: p.authorization_code,
        affiliation: process.env.NEOPAY_CARD_ACQ_ID,
        audit_number: p.audit_number,
        status: p.status
      }
    });

  } catch (error) {
  console.error("createPayment error:", error);

  return res.status(500).json({
    ok: false,
    message: error.message || "Error procesando pago",
    detail: error.data || null
  });
 }
}