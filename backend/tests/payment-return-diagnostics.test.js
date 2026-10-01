const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeReturnFields } = require("../services/paymentReturnDiagnostics");

test("return diagnostics preserve status but omit tokens and identifying values", () => {
  const input = {
    Status: "Y", ErrorNumber: 0, JWT: "secret-jwt",
    TransactionId: "private-id", email: "private-email", ErrorDescription: "private-message"
  };
  const result = summarizeReturnFields(input);
  assert.deepEqual(result.statuses, { Status: "Y", ErrorNumber: 0 });
  assert.equal(result.has_jwt, true);
  assert.equal(result.has_transaction_id, true);
  for (const secret of ["secret-jwt", "private-id", "private-email", "private-message"]) {
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
  assert.equal(input.JWT, "secret-jwt");
});

test("missing or malformed return fields do not imply successful authentication", () => {
  assert.deepEqual(summarizeReturnFields(undefined).statuses, {});
  assert.deepEqual(summarizeReturnFields({ Status: { unexpected: true } }).statuses,
    { Status: "[OMITTED]" });
});

test("encoded Response reveals only status fields and never implies verification", () => {
  const payload = { ActionCode: "SUCCESS", ErrorNumber: 0,
    Payment: { ExtendedData: { PAResStatus: "Y", CAVV: "private-cryptogram" } },
    TransactionId: "private-transaction", JWT: "private-token" };
  const json = JSON.stringify(payload);
  for (const response of [json, Buffer.from(json).toString("base64"),
    `e30.${Buffer.from(json).toString("base64url")}.signature`]) {
    const result = summarizeReturnFields({ Response: response });
    assert.equal(result.nested.Response.trusted, false);
    assert.equal(result.nested.Response.statuses.ActionCode, "SUCCESS");
    assert.equal(result.nested.Response.nested.Payment.nested.ExtendedData.statuses.PAResStatus, "Y");
    assert.equal(JSON.stringify(result).includes("private-"), false);
  }
});

test("invalid and oversized Response values are not logged", () => {
  for (const value of ["private-invalid-value", "x".repeat(65537)]) {
    const result = summarizeReturnFields({ Response: value });
    assert.equal(JSON.stringify(result).includes(value), false);
    assert.equal(result.nested.Response.trusted, undefined);
  }
});
