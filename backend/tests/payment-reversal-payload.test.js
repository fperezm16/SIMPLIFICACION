const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildReversePayloadFromOriginal
} = require("../services/paymentGatewayService");

test("la reversa NeoNet conserva todos los datos originales salvo MessageTypeId", () => {
  const originalPayload = {
    MessageTypeId: "0200",
    ProcessingCode: "000000",
    SystemsTraceNo: "000389",
    TimeLocalTrans: "102258",
    DateLocalTrans: "0925",
    Merchant: { TerminalId: "test-terminal" },
    Amount: { AmountTrans: "000000140000" },
    PrivateUse63: { HostReferenceData31: "625910585424" },
    PayerAuthentication: {
      Step: "3",
      ReferenceId: "reference-test",
      browserLanguage: "es-GT",
      browserScreenWidth: "1920"
    }
  };

  const reversePayload = buildReversePayloadFromOriginal(originalPayload);
  const expected = structuredClone(originalPayload);
  expected.MessageTypeId = "0400";

  assert.deepEqual(reversePayload, expected);
  assert.equal(originalPayload.MessageTypeId, "0200");
  assert.notStrictEqual(reversePayload, originalPayload);
});

test("la reversa NeoNet requiere el request original", () => {
  assert.throws(
    () => buildReversePayloadFromOriginal(null),
    /request original/i
  );
});
