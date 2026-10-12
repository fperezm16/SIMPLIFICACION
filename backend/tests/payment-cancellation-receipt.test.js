const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSnapshot,
  generateCancellationReceiptPdf
} = require("../services/paymentCancellationReceiptService");

function cancelledPayment() {
  return {
    id: 452,
    submission_id: 99,
    status: "cancelled",
    amount: "1400.00",
    card_brand: "MASTERCARD",
    masked_card: "**** **** **** 1096",
    cardholder_name: "PRUEBA",
    reference_number: "628117000493",
    authorization_code: "570618",
    audit_number: "000493",
    response_code: "00",
    created_at: "2026-10-08T17:35:41.940Z",
    updated_at: "2026-10-08T17:36:26.383Z",
    cancellation_reason: "Pago duplicado",
    cancelled_by: "Operador de pagos",
    cancelled_by_role: "operador_pagos",
    raw_response: {
      cancellation: {
        request: {
          SystemsTraceNo: "000493",
          Card: {
            PrimaryAcctNum: "5200000000001096",
            Cvv2: "123"
          }
        },
        response: {
          ResponseCode: "00",
          PrivateUse63: { AlternateHostResponse22: "APROBADA" }
        }
      }
    }
  };
}

test("cancellation receipt snapshot is immutable-safe and excludes card secrets", () => {
  const snapshot = buildSnapshot(cancelledPayment());
  const serialized = JSON.stringify(snapshot);

  assert.equal(snapshot.receipt_number, "ANU-2026-000452");
  assert.equal(snapshot.systems_trace_no, "000493");
  assert.equal(snapshot.response_code, "00");
  assert.equal(snapshot.reason, "Pago duplicado");
  assert.match(snapshot.masked_card, /1096$/);
  assert.ok(!serialized.includes("5200000000001096"));
  assert.ok(!serialized.includes('"123"'));
});

test("cancellation receipt generator produces a PDF", async () => {
  const snapshot = buildSnapshot(cancelledPayment());
  const pdf = await generateCancellationReceiptPdf(snapshot);

  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.length > 1000);
});
