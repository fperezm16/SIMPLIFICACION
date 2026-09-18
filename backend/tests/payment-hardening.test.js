const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    }
  };
}

function withModuleMocks(moduleMap, targetRelativePath) {
  const targetPath = path.resolve(__dirname, targetRelativePath);
  const previousEntries = new Map();

  for (const [relativePath, exportsValue] of Object.entries(moduleMap)) {
    const resolvedPath = path.resolve(__dirname, relativePath);
    previousEntries.set(resolvedPath, require.cache[resolvedPath]);
    require.cache[resolvedPath] = {
      id: resolvedPath,
      filename: resolvedPath,
      loaded: true,
      exports: exportsValue
    };
  }

  delete require.cache[targetPath];

  try {
    return require(targetPath);
  } finally {
    delete require.cache[targetPath];
    for (const [resolvedPath, previousEntry] of previousEntries.entries()) {
      if (previousEntry) {
        require.cache[resolvedPath] = previousEntry;
      } else {
        delete require.cache[resolvedPath];
      }
    }
  }
}

function createBasePayload() {
  return {
    MessageTypeId: "",
    ProcessingCode: "",
    SystemsTraceNo: "",
    TimeLocalTrans: "",
    DateLocalTrans: "",
    PosEntryMode: "012",
    Nii: "003",
    PosConditionCode: "00",
    AdditionalData: "",
    OrderInformation: "",
    FormatId: "1",
    Merchant: {
      TerminalId: "TEST_TERMINAL",
      CardAcqId: "TEST_ACQ"
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

test("manual reverse route enforces auth and allowed roles before controller", async () => {
  const hits = [];
  const paymentRoutes = withModuleMocks(
    {
      "../controllers/paymentController.js": {
        getPaymentHealth: (_req, res) => res.json({ ok: true }),
        renderThreeDSReturnPage: (_req, res) => res.send("ok"),
        createPayment: (_req, res) => res.json({ ok: true }),
        continuePayment: (_req, res) => res.json({ ok: true }),
        listReversalPayments: (_req, res) => res.json({ ok: true, payments: [] }),
        getReversalHistory: (_req, res) => res.json({ ok: true, history: [] }),
        cancelPayment: (req, res) => {
          hits.push({ route: "cancel", role: req.user?.role || null });
          res.json({ ok: true, route: "cancel" });
        },
        reversePayment: (req, res) => {
          hits.push({ route: "reverse", role: req.user?.role || null });
          res.json({ ok: true, route: "reverse", role: req.user?.role || null });
        },
        getVoucher: (_req, res) => res.json({ ok: true }),
        downloadVoucherPdf: (_req, res) => res.send("pdf")
      }
    },
    "../routes/paymentRoutes.js"
  );

  const app = express();
  app.use("/api/payments", paymentRoutes);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api/payments/55`;

    const noAuth = await fetch(`${baseUrl}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(noAuth.status, 401);
    const noAuthBody = await noAuth.json();
    assert.equal(noAuthBody.error, "No autenticado.");
    assert.equal(hits.length, 0);

    const wrongRoleToken = jwt.sign({ sub: 7, role: "user" }, process.env.JWT_SECRET);
    const forbidden = await fetch(`${baseUrl}/reverse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${wrongRoleToken}`
      },
      body: JSON.stringify({})
    });
    assert.equal(forbidden.status, 403);
    const forbiddenBody = await forbidden.json();
    assert.equal(forbiddenBody.error, "No autorizado.");
    assert.ok(!JSON.stringify(forbiddenBody).includes("Pago no encontrado"));
    assert.equal(hits.length, 0);

    for (const role of ["admin", "supervisor", "operador_pagos"]) {
      const token = jwt.sign({ sub: 10, role }, process.env.JWT_SECRET);
      const response = await fetch(`${baseUrl}/reverse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.role, role);
    }

    const cancelWithoutAuth = await fetch(`${baseUrl}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(cancelWithoutAuth.status, 401);

    assert.deepEqual(
      hits,
      [
        { route: "reverse", role: "admin" },
        { route: "reverse", role: "supervisor" },
        { route: "reverse", role: "operador_pagos" }
      ]
    );
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("reversePayment registers administrative audit on success and failure", async () => {
  const auditCalls = [];
  const markCalls = [];
  const payment = {
    id: 77,
    submission_id: 501,
    amount: "1400.00",
    status: "approved",
    reference_number: "620411000001",
    audit_number: "000123",
    raw_response: {
      flow: "3ds",
      threeDS: { step: "5", referenceId: "reference-test" }
    }
  };

  function loadControllerWithGatewayResponse(neoResponse) {
    return withModuleMocks(
      {
        "../services/neonetService.js": {
          getConfigDiagnostics: () => ({ ok: true, checks: {}, endpoint: "http://test" })
        },
        "../services/paymentVoucherService.js": {
          buildVoucherData: () => ({}),
          generateVoucherPdfBuffer: async () => Buffer.from("pdf")
        },
        "../services/paymentOrchestrator.js": {
          createPayment: async () => ({ statusCode: 200, body: { ok: true } }),
          continuePayment: async () => ({ statusCode: 200, body: { ok: true } })
        },
        "../services/paymentThreeDSService.js": {
          resolveThreeDSReturnUrl: () => "http://localhost/3ds"
        },
        "../services/paymentGatewayService.js": {
          dispatchPayment: async () => neoResponse,
          mapGatewayError: (error) => ({
            statusCode: 500,
            message: error?.message || "error",
            detail: null
          })
        },
        "../services/paymentPersistenceService.js": {
          getNextSystemsTraceNo: async () => "000999",
          getPaymentById: async () => payment,
          markPaymentCancelled: async () => ({ rows: [] }),
          markPaymentReversed: async (paymentId, gatewayResponse) => {
            markCalls.push({ paymentId, gatewayResponse });
            return {
              rows: [
                {
                  ...payment,
                  id: Number(paymentId),
                  status: "reversed",
                  response_code: gatewayResponse.ResponseCode
                }
              ]
            };
          }
        },
        "../services/paymentPayloadService.js": {
          buildBasePayload: () => createBasePayload()
        },
        "../services/paymentAdminAuditService.js": {
          registerAdministrativeCancellationAudit: async () => {},
          registerAdministrativeReverseAudit: async (payload) => {
            auditCalls.push(payload);
          }
        }
      },
      "../controllers/paymentController.js"
    );
  }

  const successController = loadControllerWithGatewayResponse({
    ResponseCode: "00",
    RetrievalRefNo: "620411000001",
    AuthIdResponse: "018952",
    SystemsTraceNo: "000999",
    PrivateUse63: {
      AlternateHostResponse22: "SUCCESS"
    }
  });

  const successReq = {
    params: { id: "77" },
    body: {
      reason: "Reversa administrativa por prueba"
    },
    headers: {},
    ip: "127.0.0.1",
    user: {
      sub: 99,
      role: "operador_pagos"
    }
  };
  const successRes = createMockRes();
  await successController.reversePayment(successReq, successRes);

  assert.equal(successRes.statusCode, 200);
  assert.equal(successRes.body.status, "reversed");
  assert.equal(markCalls.length, 1);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].outcome, "success");
  assert.equal(auditCalls[0].actorRole, "operador_pagos");

  auditCalls.length = 0;
  markCalls.length = 0;

  const failedController = loadControllerWithGatewayResponse({
    ResponseCode: "05",
    RetrievalRefNo: "620411000001",
    AuthIdResponse: "000000",
    SystemsTraceNo: "000999",
    PrivateUse63: {
      AlternateHostResponse22: "REJECTED"
    }
  });

  const failedRes = createMockRes();
  await failedController.reversePayment(successReq, failedRes);

  assert.equal(failedRes.statusCode, 400);
  assert.equal(failedRes.body.message, "Reversa rechazada");
  assert.equal(markCalls.length, 0);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].outcome, "failed");
});

test("sanitizeForLog redacts and masks sensitive transactional fields without mutating input", () => {
  const {
    sanitizeForLog,
    REDACTED_VALUE
  } = require("../services/paymentHelpersService");

  const original = {
    Card: {
      PrimaryAcctNum: "4111111111111111",
      Cvv2: "123"
    },
    MerchantPasswd: "secret-pass",
    MerchantUser: "merchant-user",
    Authorization: "Bearer test",
    headers: {
      Cookie: "a=b",
      "Set-Cookie": "x=y"
    },
    PayerAuthentication: {
      AccessToken: "eyJhbGciOi...",
      ReferenceId: "fd08aa8c-1bb8-4677-8f01-34c6d8e556ad"
    },
    BillTo: {
      Email: "jpereztest@correo.com",
      PhoneNumber: "12345678"
    },
    items: [
      {
        pan: "5200000000001005",
        email: "af@gmail.com"
      }
    ]
  };

  const snapshot = JSON.parse(JSON.stringify(original));
  const sanitized = sanitizeForLog(original);

  assert.equal(original.Card.PrimaryAcctNum, snapshot.Card.PrimaryAcctNum);
  assert.equal(original.Card.Cvv2, snapshot.Card.Cvv2);
  assert.notStrictEqual(sanitized, original);
  assert.equal(sanitized.Card.PrimaryAcctNum, "411111******1111");
  assert.equal(sanitized.Card.Cvv2, REDACTED_VALUE);
  assert.equal(sanitized.MerchantPasswd, REDACTED_VALUE);
  assert.equal(sanitized.MerchantUser, REDACTED_VALUE);
  assert.equal(sanitized.Authorization, REDACTED_VALUE);
  assert.equal(sanitized.headers.Cookie, REDACTED_VALUE);
  assert.equal(sanitized.headers["Set-Cookie"], REDACTED_VALUE);
  assert.equal(sanitized.PayerAuthentication.AccessToken, REDACTED_VALUE);
  assert.equal(sanitized.PayerAuthentication.ReferenceId, "fd08aa8c...56ad");
  assert.equal(sanitized.BillTo.Email, "jp***@correo.com");
  assert.equal(sanitized.BillTo.PhoneNumber, "******78");
  assert.equal(sanitized.items[0].pan, "520000******1005");
  assert.equal(sanitized.items[0].email, "a***@gmail.com");
});

test("buildAxiosErrorLog preserves safe correlation data and excludes secrets", () => {
  const {
    buildAxiosErrorLog,
    REDACTED_VALUE
  } = require("../services/paymentHelpersService");

  const axiosLikeError = {
    name: "AxiosError",
    code: "ECONNABORTED",
    message: "timeout of 60000ms exceeded",
    config: {
      method: "post",
      url: "https://gateway.example/api/AuthorizationPaymentCommerce?token=secret"
    },
    request: {},
    response: {
      status: 504,
      data: {
        ResponseCode: "91",
        SystemsTraceNo: "000321",
        MerchantPasswd: "bad",
        Card: {
          PrimaryAcctNum: "4000000000002503",
          Cvv2: "123"
        },
        PayerAuthentication: {
          Step: "5",
          AccessToken: "eyJhbGciOi...",
          ReferenceId: "18c94f4e-cf2d-4b45-aaae-6428a00d3ff2"
        },
        PrivateUse63: {
          AlternateHostResponse22: "TIMEOUT"
        }
      }
    }
  };

  const safe = buildAxiosErrorLog(axiosLikeError, {
    service: "neonetService",
    phase: "sendTransaction.network_error",
    paymentId: 10,
    submissionId: 20
  });

  assert.equal(safe.service, "neonetService");
  assert.equal(safe.phase, "sendTransaction.network_error");
  assert.equal(safe.payment_id, 10);
  assert.equal(safe.submission_id, 20);
  assert.equal(safe.code, "ECONNABORTED");
  assert.equal(safe.http_status, 504);
  assert.equal(safe.method, "POST");
  assert.equal(safe.url, "https://gateway.example/api/AuthorizationPaymentCommerce");
  assert.equal(safe.response_code, "91");
  assert.equal(safe.step, "5");
  assert.equal(safe.systems_trace_no, "000321");
  assert.equal(safe.reference_id, "18c94f4e...3ff2");
  assert.equal(safe.has_request, true);
  assert.equal(safe.has_response, true);
  assert.equal(safe.alternate_host_response, "TIMEOUT");
  assert.equal(safe.MerchantPasswd, undefined);
  assert.equal(safe.AccessToken, undefined);
  assert.notEqual(JSON.stringify(safe).includes("4000000000002503"), true);
  assert.notEqual(JSON.stringify(safe).includes("eyJhbGciOi"), true);
  assert.notEqual(JSON.stringify(safe).includes("123"), true);
  assert.equal(JSON.stringify(safe).includes(REDACTED_VALUE), false);
});

test("traceThreeDS emits only sanitized diagnostic data", async () => {
  const originalDebug = process.env.NEOPAY_3DS_DEBUG;
  process.env.NEOPAY_3DS_DEBUG = "true";

  const logs = [];
  const originalConsoleLog = console.log;
  console.log = (...args) => {
    logs.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const orchestrator = withModuleMocks(
      {
        "../services/paymentGatewayService.js": {
          dispatchPayment: async () => ({
            ResponseCode: "-4",
            SystemsTraceNo: "000456",
            PrivateUse63: {
              AlternateHostResponse22: "TRANSACTION DENIED"
            },
            PayerAuthentication: {
              Step: "3",
              ReferenceId: "86fa6f1c-c7ae-4eb0-95b5-f3b28f20d8ac",
              AccessToken: "eyJhbGciOi..."
            },
            Card: {
              PrimaryAcctNum: "5200000000001005",
              Cvv2: "123"
            }
          }),
          mapGatewayError: (error) => ({
            statusCode: 500,
            message: error?.message || "error",
            detail: null
          }),
          executeAutomaticReverse: async () => ({ ResponseCode: "00" })
        },
        "../services/paymentPersistenceService.js": {
          getPaymentById: async () => ({
            id: 88,
            submission_id: 900,
            status: "pending_3ds",
            amount: "1400.00",
            transaction_id: "000456",
            audit_number: "000456",
            raw_response: {
              latest: {
                SystemsTraceNo: "000456",
                PayerAuthentication: {
                  ReferenceId: "86fa6f1c-c7ae-4eb0-95b5-f3b28f20d8ac"
                }
              },
              threeDS: {
                referenceId: "86fa6f1c-c7ae-4eb0-95b5-f3b28f20d8ac",
                step: "2"
              }
            }
          }),
          updatePaymentAfterGatewayStep: async (_paymentId, payload) => ({
            rows: [
              {
                id: 88,
                submission_id: 900,
                status: payload.paymentStatus,
                raw_response: payload.rawResponse
              }
            ]
          })
        },
        "../services/paymentPayloadService.js": {
          buildBasePayload: () => createBasePayload(),
          buildStandardSalePayload: () => createBasePayload()
        },
        "../services/paymentThreeDSService.js": {
          buildThreeDSStep1Payload: () => createBasePayload(),
          buildThreeDSStepPayload: ({ systemsTraceNo, step, referenceId }) => ({
            ...createBasePayload(),
            SystemsTraceNo: systemsTraceNo,
            PayerAuthentication: {
              Step: step,
              ReferenceId: referenceId,
              AccessToken: "eyJhbGciOi..."
            },
            Card: {
              PrimaryAcctNum: "5200000000001005",
              Cvv2: "123"
            }
          }),
          extractThreeDSData: () => ({
            referenceId: "86fa6f1c-c7ae-4eb0-95b5-f3b28f20d8ac"
          }),
          evaluateThreeDSResult: () => ({
            status: "approved",
            reason: "step3_frictionless_approved",
            requestedStep: "3",
            responseStep: "3",
            responseCode: "-4",
            isApprovedCode: false,
            isPending: false,
            isChallenge: false,
            isFinal: true,
            hasReferenceId: true,
            hasResponseReferenceId: true,
            hasStoredReferenceId: true,
            hasAccessToken: false,
            hasDeviceDataCollectionUrl: false,
            referenceIdMatchesStored: true,
            referenceId: "86fa6f1c-c7ae-4eb0-95b5-f3b28f20d8ac"
          }),
          buildThreeDSClientData: () => ({
            referenceId: "86fa6f1c-c7ae-4eb0-95b5-f3b28f20d8ac",
            step: "3"
          }),
          mergeThreeDSRawResponse: (_existing, incoming) => ({
            latest: incoming.latest,
            threeDS: incoming.threeDS
          })
        }
      },
      "../services/paymentOrchestrator.js"
    );

    const result = await orchestrator.continuePayment(
      88,
      {},
      {
        shopperIP: "127.0.0.1",
        browserData: {
          browserLanguage: "es",
          browserAcceptHeader: "application/json",
          browserUserAgent: "UnitTestAgent",
          browserScreenWidth: "1920",
          browserScreenHeight: "1080",
          browserColorDepth: "24",
          browserJavaEnabled: "false",
          browserTZ: "360"
        }
      }
    );

    assert.equal(result.statusCode, 200);
    assert.ok(logs.some((entry) => entry.includes("[3DS TRACE] continuePayment.request")));
    assert.ok(logs.some((entry) => entry.includes("[3DS TRACE] continuePayment.response")));
    const serializedLogs = logs.join("\n");
    assert.ok(serializedLogs.includes("\"payment_id\": 88"));
    assert.ok(serializedLogs.includes("\"submission_id\": 900"));
    assert.ok(serializedLogs.includes("\"step\": \"3\""));
    assert.ok(serializedLogs.includes("\"reference_id\": \"86fa6f1c...d8ac\""));
    assert.ok(!serializedLogs.includes("5200000000001005"));
    assert.ok(!serializedLogs.includes("eyJhbGciOi"));
    assert.ok(!serializedLogs.includes("\"payload\""));
    assert.ok(!serializedLogs.includes("\"neoResponse\""));
  } finally {
    console.log = originalConsoleLog;
    process.env.NEOPAY_3DS_DEBUG = originalDebug;
  }
});
