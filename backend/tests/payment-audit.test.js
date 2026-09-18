const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

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
    Customer: {},
    BillTo: {},
    ShipTo: {},
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

function createMockResponseRecorder() {
  return {
    statusCode: 200,
    body: null,
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
    setHeader() {}
  };
}

test("pending 3DS response returns accessToken only in three_ds and not in payment or neo_response", async () => {
  const orchestrator = withModuleMocks(
    {
      "../services/paymentGatewayService.js": {
        dispatchPayment: async () => ({
          ResponseCode: "00",
          SystemsTraceNo: "000401",
          PayerAuthentication: {
            Step: "2",
            ReferenceId: "ref-401",
            AccessToken: "jwt-pending-token",
            DeviceDataCollectionUrl: "https://ddc.test"
          }
        }),
        classifyGatewayError: () => ({
          requestMayHaveReachedGateway: false
        }),
        mapGatewayError: () => ({
          statusCode: 500,
          message: "error",
          detail: {}
        }),
        executeAutomaticReverse: async () => ({ ResponseCode: "00" })
      },
      "../services/paymentPersistenceService.js": {
        getNextSystemsTraceNo: async () => "000401",
        getSubmissionPaymentData: async () => ({ correo: "test@demo.com" }),
        insertPayment: async (payload) => ({
          rows: [{
            id: 401,
            submission_id: payload.submission_id,
            status: payload.paymentStatus,
            raw_response: payload.rawResponse
          }]
        }),
        getPaymentById: async () => null,
        updatePaymentAfterGatewayStep: async () => ({ rows: [] })
      },
      "../services/paymentPayloadService.js": {
        buildBasePayload: () => createBasePayload(),
        buildStandardSalePayload: () => createBasePayload()
      }
    },
    "../services/paymentOrchestrator.js"
  );

  const result = await orchestrator.createPayment({
    submission_id: 401,
    amount: 1400,
    card_number: "4456530000001005",
    expiration_date: "2912",
    cvv: "123",
    cardholder_name: "JUAN PEREZ",
    email: "test@demo.com"
  }, { shopperIP: "127.0.0.1", browserData: {} });

  assert.equal(result.body.status, "pending_3ds");
  assert.equal(result.body.three_ds.accessToken, "jwt-pending-token");
  assert.equal(result.body.neo_response.PayerAuthentication.AccessToken, undefined);
  assert.equal(result.body.payment.raw_response.threeDS.accessToken, undefined);
  assert.equal(result.body.payment.raw_response.step1.PayerAuthentication.AccessToken, undefined);
});

test("final 3DS approved response does not expose accessToken in neo_response or payment raw_response", async () => {
  const orchestrator = withModuleMocks(
    {
      "../services/paymentGatewayService.js": {
        dispatchPayment: async () => ({
          ResponseCode: "00",
          SystemsTraceNo: "000402",
          PayerAuthentication: {
            Step: "6",
            ReferenceId: "ref-402",
            AccessToken: "jwt-final-token"
          }
        }),
        classifyGatewayError: () => ({
          requestMayHaveReachedGateway: false
        }),
        mapGatewayError: () => ({
          statusCode: 500,
          message: "error",
          detail: {}
        }),
        executeAutomaticReverse: async () => ({ ResponseCode: "00" })
      },
      "../services/paymentPersistenceService.js": {
        getNextSystemsTraceNo: async () => "000402",
        getSubmissionPaymentData: async () => ({ correo: "test@demo.com" }),
        insertPayment: async () => ({ rows: [] }),
        getPaymentById: async () => ({
          id: 402,
          submission_id: 402,
          status: "challenge_required",
          amount: "1400.00",
          transaction_id: "000402",
          audit_number: "000402",
          raw_response: {
            step1: {
              PayerAuthentication: {
                ReferenceId: "ref-402",
                AccessToken: "jwt-step1-token"
              }
            },
            threeDS: {
              referenceId: "ref-402",
              accessToken: "jwt-step1-token",
              step: "5"
            }
          }
        }),
        updatePaymentAfterGatewayStep: async (_id, payload) => ({
          rows: [{
            id: 402,
            submission_id: 402,
            status: payload.paymentStatus,
            raw_response: payload.rawResponse
          }]
        })
      },
      "../services/paymentPayloadService.js": {
        buildBasePayload: () => createBasePayload(),
        buildStandardSalePayload: () => createBasePayload()
      }
    },
    "../services/paymentOrchestrator.js"
  );

  const result = await orchestrator.continuePayment(402, {}, {
    shopperIP: "127.0.0.1",
    browserData: {}
  });

  assert.equal(result.body.status, "approved");
  assert.equal(result.body.three_ds, undefined);
  assert.equal(result.body.neo_response.PayerAuthentication.AccessToken, undefined);
  assert.equal(result.body.payment.raw_response.threeDS.accessToken, undefined);
  assert.equal(result.body.payment.raw_response.latest.PayerAuthentication.AccessToken, undefined);
});

test("reversePayment does not expose historical accessToken in returned payment", async () => {
  const controller = withModuleMocks(
    {
      "../services/paymentOrchestrator.js": {
        createPayment: async () => ({ statusCode: 200, body: { ok: true } }),
        continuePayment: async () => ({ statusCode: 200, body: { ok: true } })
      },
      "../services/paymentThreeDSService.js": {
        resolveThreeDSReturnUrl: () => "http://localhost:4000/api/payments/3ds/return"
      },
      "../services/paymentGatewayService.js": {
        dispatchPayment: async () => ({
          ResponseCode: "00",
          RetrievalRefNo: "620411000777"
        }),
        mapGatewayError: () => ({
          statusCode: 500,
          message: "error",
          detail: {}
        })
      },
      "../services/paymentPersistenceService.js": {
        getNextSystemsTraceNo: async () => "000777",
        getPaymentById: async () => ({
          id: 777,
          submission_id: 777,
          status: "approved",
          amount: "1400.00",
          reference_number: "620411000777",
          audit_number: "000777",
          raw_response: {
            flow: "3ds",
            threeDS: { step: "5", referenceId: "reference-test" }
          }
        }),
        markPaymentCancelled: async () => ({ rows: [] }),
        markPaymentReversed: async () => ({
          rows: [{
            id: 777,
            submission_id: 777,
            status: "reversed",
            raw_response: {
              threeDS: {
                accessToken: "jwt-stored-token"
              },
              latest: {
                PayerAuthentication: {
                  AccessToken: "jwt-stored-token"
                }
              }
            }
          }]
        })
      },
      "../services/paymentAdminAuditService.js": {
        registerAdministrativeCancellationAudit: async () => {},
        registerAdministrativeReverseAudit: async () => {}
      },
      "../services/paymentVoucherService.js": {
        buildVoucherData: () => ({}),
        generateVoucherPdfBuffer: async () => Buffer.from("pdf")
      },
      "../services/neonetService.js": {
        getConfigDiagnostics: () => ({ ok: true })
      }
    },
    "../controllers/paymentController.js"
  );

  const req = {
    params: { id: "777" },
    body: {
      reason: "control"
    },
    headers: {},
    ip: "127.0.0.1",
    user: { sub: 10, role: "operador_pagos" }
  };
  const res = createMockResponseRecorder();

  await controller.reversePayment(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "reversed");
  assert.equal(res.body.payment.raw_response.threeDS.accessToken, undefined);
  assert.equal(res.body.payment.raw_response.latest.PayerAuthentication.AccessToken, undefined);
});
