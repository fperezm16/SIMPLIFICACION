const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadAuditService(queryCalls) {
  const dbPath = path.resolve(__dirname, "../src/db.js");
  const servicePath = path.resolve(__dirname, "../services/paymentAdminAuditService.js");
  const previousDb = require.cache[dbPath];

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      pool: {
        query: async (sql, params) => {
          queryCalls.push({ sql, params });
          return { rows: [], rowCount: 1 };
        }
      }
    }
  };
  delete require.cache[servicePath];

  try {
    return require(servicePath);
  } finally {
    delete require.cache[servicePath];
    if (previousDb) require.cache[dbPath] = previousDb;
    else delete require.cache[dbPath];
  }
}

test("administrative cancellation audit is stored by payment before optional submission log", async () => {
  const queryCalls = [];
  const service = loadAuditService(queryCalls);

  await service.registerAdministrativeCancellationAudit({
    payment: {
      id: 452,
      submission_id: 99,
      status: "approved",
      reference_number: "628117000493",
      audit_number: "000493",
      raw_response: {
        reversal_request: { payload: { SystemsTraceNo: "000493" } }
      }
    },
    actorUserId: 7,
    actorRole: "operador_pagos",
    reason: "Pago duplicado",
    outcome: "success",
    neoResponse: {
      ResponseCode: "00",
      SystemsTraceNo: "000493",
      PrivateUse63: { AlternateHostResponse22: "APROBADA" }
    }
  });

  assert.equal(queryCalls.length, 2);
  assert.match(queryCalls[0].sql, /INSERT INTO payment_operation_logs/);
  assert.equal(queryCalls[0].params[0], 452);
  assert.equal(queryCalls[0].params[2], "cancel");
  assert.equal(queryCalls[0].params[3], "success");
  assert.equal(queryCalls[0].params[5], "Pago duplicado");
  assert.equal(queryCalls[0].params[8], "00");
  assert.equal(queryCalls[0].params[10], "000493");
  assert.equal(queryCalls[0].params[11], "628117000493");
  assert.match(queryCalls[1].sql, /WHERE EXISTS \(SELECT 1 FROM submissions/);
});
