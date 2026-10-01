const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizePaymentForClient } = require("../services/paymentHelpersService");

test("conserva el codigo de autorizacion de NeoNet en la respuesta para la UI", () => {
  const payment = sanitizePaymentForClient({
    id: 433,
    authorization_code: "007613",
    reference_number: "627410000474",
    raw_response: {
      Authorization: "internal-header-value",
      AuthIdResponse: "007613"
    }
  });

  assert.equal(payment.authorization_code, "007613");
  assert.equal(payment.reference_number, "627410000474");
  assert.equal("Authorization" in payment.raw_response, false);
});
