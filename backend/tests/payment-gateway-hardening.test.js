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

function resolveFromBackend(moduleName) {
  return require.resolve(moduleName, {
    paths: [path.resolve(__dirname, "..")]
  });
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

function buildGatewayError({
  type = "NETWORK_ERROR",
  code = null,
  message = "gateway failure",
  status = null,
  hadRequest = false,
  hadResponse = false,
  data = null
} = {}) {
  return {
    type,
    code,
    message,
    status,
    hadRequest,
    hadResponse,
    request: hadRequest ? {} : undefined,
    response: hadResponse ? { status, data } : undefined,
    data
  };
}

const gatewayService = require("../services/paymentGatewayService");

const classificationCases = [
  ["validation error is pre-dispatch", buildGatewayError({ type: "VALIDATION_ERROR", message: "payload invalido" }), "validation_error", false, false],
  ["authentication error local is no reversal", buildGatewayError({ status: 401, hadResponse: true }), "authentication_error", false, false],
  ["ENOTFOUND maps to dns_error", buildGatewayError({ code: "ENOTFOUND" }), "dns_error", false, false],
  ["EAI_AGAIN maps to dns_error", buildGatewayError({ code: "EAI_AGAIN" }), "dns_error", false, false],
  ["ECONNREFUSED maps to connection_refused", buildGatewayError({ code: "ECONNREFUSED", hadRequest: false }), "connection_refused", false, false],
  ["ECONNRESET with request is ambiguous", buildGatewayError({ code: "ECONNRESET", hadRequest: true }), "connection_reset", true, true],
  ["ETIMEDOUT with request is ambiguous", buildGatewayError({ code: "ETIMEDOUT", hadRequest: true }), "socket_timeout", true, true],
  ["ECONNABORTED timeout is ambiguous", buildGatewayError({ code: "ECONNABORTED", hadRequest: true }), "axios_timeout", true, true],
  ["socket hang up is ambiguous", buildGatewayError({ message: "socket hang up", hadRequest: true }), "network_error_ambiguous", true, true],
  ["request without response is ambiguous", buildGatewayError({ hadRequest: true }), "network_error_ambiguous", true, true],
  ["HTTP 400 without NeoNet body is client error", buildGatewayError({ status: 400, hadRequest: true, hadResponse: true }), "http_client_error", false, false],
  ["HTTP 401 without NeoNet body is auth error", buildGatewayError({ status: 401, hadRequest: true, hadResponse: true }), "authentication_error", false, false],
  ["HTTP 403 without NeoNet body is auth error", buildGatewayError({ status: 403, hadRequest: true, hadResponse: true }), "authentication_error", false, false],
  ["HTTP 404 without NeoNet body is client error", buildGatewayError({ status: 404, hadRequest: true, hadResponse: true }), "http_client_error", false, false],
  ["HTTP 500 without NeoNet body is ambiguous", buildGatewayError({ status: 500, hadRequest: true, hadResponse: true }), "http_server_error", true, true],
  ["HTTP 502 is ambiguous", buildGatewayError({ status: 502, hadRequest: true, hadResponse: true }), "http_server_error", true, true],
  ["HTTP 503 is ambiguous", buildGatewayError({ status: 503, hadRequest: true, hadResponse: true }), "http_server_error", true, true],
  ["HTTP 504 is ambiguous", buildGatewayError({ status: 504, hadRequest: true, hadResponse: true }), "http_server_error", true, true],
  ["HTTP 500 with ResponseCode 91 is gateway timeout", buildGatewayError({ status: 500, hadRequest: true, hadResponse: true, data: { ResponseCode: "91" } }), "gateway_timeout_response", true, true],
  ["ResponseCode 91 is gateway timeout", buildGatewayError({ data: { ResponseCode: "91" } }), "gateway_timeout_response", true, true],
  ["rejection response code is gateway rejection", buildGatewayError({ data: { ResponseCode: "05" } }), "gateway_rejection_response", false, true],
  ["invalid parse response is invalid_http_response", buildGatewayError({ message: "Unexpected token < in JSON", hadResponse: true }), "invalid_http_response", true, true],
  ["unknown error without request stays pre-dispatch", buildGatewayError({ message: "misterio total" }), "validation_error", false, false],
  ["unknown error with request is ambiguous", buildGatewayError({ message: "misterio total", hadRequest: true }), "network_error_ambiguous", true, true]
];

for (const [name, error, category, shouldReverse, mayReach] of classificationCases) {
  test(name, () => {
    const result = gatewayService.classifyGatewayError(error);
    assert.equal(result.category, category);
    assert.equal(result.shouldAttemptAutomaticReversal, shouldReverse);
    assert.equal(result.requestMayHaveReachedGateway, mayReach);
  });
}

test("mapGatewayError returns safe detail without raw response body", () => {
  const mapped = gatewayService.mapGatewayError(
    buildGatewayError({
      status: 500,
      hadRequest: true,
      hadResponse: true,
      data: {
        ResponseCode: "91",
        MerchantPasswd: "secret",
        PayerAuthentication: {
          ReferenceId: "abc-123"
        }
      }
    })
  );

  assert.equal(mapped.statusCode, 504);
  assert.equal(mapped.detail.category, "gateway_timeout_response");
  assert.equal(JSON.stringify(mapped).includes("secret"), false);
});

test("sendTransaction returns NeoNet body even on HTTP 500 when ResponseCode exists", async () => {
  const axiosModulePath = resolveFromBackend("axios");
  const neonetService = withModuleMocks(
    {
      "../services/paymentHelpersService.js": {
        ...require("../services/paymentHelpersService")
      },
      [path.relative(__dirname, axiosModulePath)]: {
        post: async () => {
          const error = new Error("gateway 500");
          error.response = {
            status: 500,
            data: {
              ResponseCode: "91",
              SystemsTraceNo: "000333"
            }
          };
          throw error;
        }
      }
    },
    "../services/neonetService.js"
  );

  process.env.NEOPAY_URL = process.env.NEOPAY_URL || "https://test";
  process.env.NEOPAY_MERCHANT_USER = process.env.NEOPAY_MERCHANT_USER || "user";
  process.env.NEOPAY_MERCHANT_PASSWD = process.env.NEOPAY_MERCHANT_PASSWD || "pass";
  process.env.NEOPAY_PAYMENTGW_IP = process.env.NEOPAY_PAYMENTGW_IP || "1.1.1.1";
  process.env.NEOPAY_MERCHANT_SERVER_IP = process.env.NEOPAY_MERCHANT_SERVER_IP || "2.2.2.2";

  const response = await neonetService.sendTransaction({}, "127.0.0.1");
  assert.equal(response.ResponseCode, "91");
  assert.equal(response.SystemsTraceNo, "000333");
});

test("createPayment normal ambiguous error with correlation persists reversed after approved reversal", async () => {
  const insertCalls = [];
  let reversePayloadSeen = null;
  const realGateway = require("../services/paymentGatewayService");
  const orchestrator = withModuleMocks(
    {
      "../services/paymentGatewayService.js": {
        ...realGateway,
        dispatchPayment: async () => {
          throw buildGatewayError({
            code: "ECONNABORTED",
            hadRequest: true,
            message: "timeout"
          });
        },
        executeAutomaticReverse: async (payload) => {
          reversePayloadSeen = payload;
          return { ResponseCode: "00", RetrievalRefNo: "620411000001" };
        }
      },
      "../services/paymentPersistenceService.js": {
        getNextSystemsTraceNo: async () => "000111",
        insertPayment: async (payload) => {
          insertCalls.push(payload);
          return { rows: [{ id: 1, submission_id: payload.submission_id, status: payload.paymentStatus, raw_response: payload.rawResponse }] };
        },
        getPaymentById: async () => null,
        getSubmissionPaymentData: async () => ({}),
        updatePaymentAfterGatewayStep: async () => ({ rows: [] })
      },
      "../services/paymentPayloadService.js": {
        buildBasePayload: () => createBasePayload(),
        buildStandardSalePayload: ({ systemsTraceNo, sanitizedCardNumber, normalizedExpiration, sanitizedCvv, amount }) => {
          const payload = createBasePayload();
          payload.MessageTypeId = "0200";
          payload.SystemsTraceNo = systemsTraceNo;
          payload.Card.PrimaryAcctNum = sanitizedCardNumber;
          payload.Card.DateExpiration = normalizedExpiration;
          payload.Card.Cvv2 = sanitizedCvv;
          payload.Amount.AmountTrans = String(amount);
          return payload;
        }
      }
    },
    "../services/paymentOrchestrator.js"
  );

  const originalCards = process.env.NEOPAY_3DS_TEST_CARDS;
  process.env.NEOPAY_3DS_TEST_CARDS = "4456530000001005";

  try {
    const result = await orchestrator.createPayment({
      submission_id: 11,
      amount: 1400,
      card_number: "4111111111110416",
      expiration_date: "2912",
      cvv: "123",
      cardholder_name: "JUAN PEREZ"
    }, { shopperIP: "127.0.0.1", browserData: {} });

    assert.equal(result.body.status, "reversed");
    assert.equal(insertCalls[0].paymentStatus, "reversed");
    assert.equal(insertCalls[0].rawResponse.gatewayFailure.category, "axios_timeout");
    assert.equal(reversePayloadSeen.MessageTypeId, "0200");
  } finally {
    process.env.NEOPAY_3DS_TEST_CARDS = originalCards;
  }
});

test("createPayment normal DNS error does not persist and does not reverse", async () => {
  let reverseCalled = 0;
  let insertCalled = 0;
  const realGateway = require("../services/paymentGatewayService");
  const orchestrator = withModuleMocks(
    {
      "../services/paymentGatewayService.js": {
        ...realGateway,
        dispatchPayment: async () => {
          throw buildGatewayError({
            code: "ENOTFOUND",
            hadRequest: false,
            message: "dns"
          });
        },
        executeAutomaticReverse: async () => {
          reverseCalled += 1;
          return { ResponseCode: "00" };
        }
      },
      "../services/paymentPersistenceService.js": {
        getNextSystemsTraceNo: async () => "000112",
        insertPayment: async () => {
          insertCalled += 1;
          return { rows: [] };
        },
        getPaymentById: async () => null,
        getSubmissionPaymentData: async () => ({}),
        updatePaymentAfterGatewayStep: async () => ({ rows: [] })
      },
      "../services/paymentPayloadService.js": {
        buildBasePayload: () => createBasePayload(),
        buildStandardSalePayload: () => createBasePayload()
      }
    },
    "../services/paymentOrchestrator.js"
  );

  const originalCards = process.env.NEOPAY_3DS_TEST_CARDS;
  process.env.NEOPAY_3DS_TEST_CARDS = "4456530000001005";

  try {
    const result = await orchestrator.createPayment({
      submission_id: 12,
      amount: 1400,
      card_number: "4111111111110416",
      expiration_date: "2912",
      cvv: "123",
      cardholder_name: "JUAN PEREZ"
    }, { shopperIP: "127.0.0.1", browserData: {} });

    assert.equal(result.body.ok, false);
    assert.equal(insertCalled, 0);
    assert.equal(reverseCalled, 0);
  } finally {
    process.env.NEOPAY_3DS_TEST_CARDS = originalCards;
  }
});

test("createPayment step1 ambiguous uses existing step1 reverse path", async () => {
  let reversePayloadSeen = null;
  const realGateway = require("../services/paymentGatewayService");
  const orchestrator = withModuleMocks(
    {
      "../services/paymentGatewayService.js": {
        ...realGateway,
        dispatchPayment: async () => {
          throw buildGatewayError({
            code: "ECONNRESET",
            hadRequest: true
          });
        },
        executeAutomaticReverse: async (payload) => {
          reversePayloadSeen = payload;
          return { ResponseCode: "00" };
        }
      },
      "../services/paymentPersistenceService.js": {
        getNextSystemsTraceNo: async () => "000113",
        insertPayment: async (payload) => ({
          rows: [{ id: 3, submission_id: payload.submission_id, status: payload.paymentStatus, raw_response: payload.rawResponse }]
        }),
        getPaymentById: async () => null,
        getSubmissionPaymentData: async () => ({ correo: "test@demo.com" }),
        updatePaymentAfterGatewayStep: async () => ({ rows: [] })
      },
      "../services/paymentPayloadService.js": {
        buildBasePayload: () => createBasePayload(),
        buildStandardSalePayload: () => createBasePayload()
      },
      "../services/paymentThreeDSService.js": {
        ...require("../services/paymentThreeDSService"),
        buildThreeDSStep1Payload: ({ systemsTraceNo }) => {
          const payload = createBasePayload();
          payload.MessageTypeId = "0200";
          payload.SystemsTraceNo = systemsTraceNo;
          payload.PayerAuthentication.Step = "1";
          return payload;
        }
      }
    },
    "../services/paymentOrchestrator.js"
  );

  const result = await orchestrator.createPayment({
    submission_id: 13,
    amount: 1400,
    card_number: "4456530000001005",
    expiration_date: "2912",
    cvv: "123",
    cardholder_name: "JUAN PEREZ",
    email: "test@demo.com"
  }, { shopperIP: "127.0.0.1", browserData: {} });

  assert.equal(result.body.status, "reversed");
  assert.equal(reversePayloadSeen.PayerAuthentication.Step, "1");
});

test("continuePayment step3 ambiguous uses reverse builder step 3", async () => {
  let reversePayloadSeen = null;
  const realGateway = require("../services/paymentGatewayService");
  const orchestrator = withModuleMocks(
    {
      "../services/paymentGatewayService.js": {
        ...realGateway,
        dispatchPayment: async () => {
          throw buildGatewayError({
            code: "ECONNRESET",
            hadRequest: true
          });
        },
        executeAutomaticReverse: async (payload) => {
          reversePayloadSeen = payload;
          return { ResponseCode: "00" };
        }
      },
      "../services/paymentPersistenceService.js": {
        getNextSystemsTraceNo: async () => "000114",
        insertPayment: async () => ({ rows: [] }),
        getSubmissionPaymentData: async () => ({ correo: "test@demo.com" }),
        getPaymentById: async () => ({
          id: 20,
          submission_id: 50,
          status: "pending_3ds",
          amount: "1400.00",
          transaction_id: "000114",
          audit_number: "000114",
          raw_response: {
            step1: { PayerAuthentication: { ReferenceId: "ref-step3" } },
            threeDS: { referenceId: "ref-step3", step: "2" }
          }
        }),
        updatePaymentAfterGatewayStep: async (_id, payload) => ({
          rows: [{ id: 20, submission_id: 50, status: payload.paymentStatus, raw_response: payload.rawResponse }]
        })
      },
      "../services/paymentPayloadService.js": {
        buildBasePayload: () => createBasePayload(),
        buildStandardSalePayload: () => createBasePayload()
      }
    },
    "../services/paymentOrchestrator.js"
  );

  const result = await orchestrator.continuePayment(20, {}, { shopperIP: "127.0.0.1", browserData: {} });
  assert.equal(result.body.status, "reversed");
  assert.equal(reversePayloadSeen.PayerAuthentication.Step, "3");
});

test("continuePayment step5 ambiguous uses reverse builder step 5", async () => {
  let reversePayloadSeen = null;
  const realGateway = require("../services/paymentGatewayService");
  const orchestrator = withModuleMocks(
    {
      "../services/paymentGatewayService.js": {
        ...realGateway,
        dispatchPayment: async () => {
          throw buildGatewayError({
            code: "ETIMEDOUT",
            hadRequest: true
          });
        },
        executeAutomaticReverse: async (payload) => {
          reversePayloadSeen = payload;
          return { ResponseCode: "00" };
        }
      },
      "../services/paymentPersistenceService.js": {
        getNextSystemsTraceNo: async () => "000115",
        insertPayment: async () => ({ rows: [] }),
        getSubmissionPaymentData: async () => ({ correo: "test@demo.com" }),
        getPaymentById: async () => ({
          id: 21,
          submission_id: 51,
          status: "challenge_required",
          amount: "1400.00",
          transaction_id: "000115",
          audit_number: "000115",
          raw_response: {
            step1: { PayerAuthentication: { ReferenceId: "ref-step5" } },
            threeDS: { referenceId: "ref-step5", step: "5" }
          }
        }),
        updatePaymentAfterGatewayStep: async (_id, payload) => ({
          rows: [{ id: 21, submission_id: 51, status: payload.paymentStatus, raw_response: payload.rawResponse }]
        })
      },
      "../services/paymentPayloadService.js": {
        buildBasePayload: () => createBasePayload(),
        buildStandardSalePayload: () => createBasePayload()
      }
    },
    "../services/paymentOrchestrator.js"
  );

  const result = await orchestrator.continuePayment(21, {}, { shopperIP: "127.0.0.1", browserData: {} });
  assert.equal(result.body.status, "reversed");
  assert.equal(reversePayloadSeen.PayerAuthentication.Step, "5");
});

test("continuePayment does not attempt reverse again when reverse evidence already exists", async () => {
  let reverseCalls = 0;
  const realGateway = require("../services/paymentGatewayService");
  const orchestrator = withModuleMocks(
    {
      "../services/paymentGatewayService.js": {
        ...realGateway,
        dispatchPayment: async () => {
          throw buildGatewayError({
            code: "ECONNRESET",
            hadRequest: true
          });
        },
        executeAutomaticReverse: async () => {
          reverseCalls += 1;
          return { ResponseCode: "00" };
        }
      },
      "../services/paymentPersistenceService.js": {
        getNextSystemsTraceNo: async () => "000116",
        insertPayment: async () => ({ rows: [] }),
        getSubmissionPaymentData: async () => ({ correo: "test@demo.com" }),
        getPaymentById: async () => ({
          id: 22,
          submission_id: 52,
          status: "pending_3ds",
          amount: "1400.00",
          transaction_id: "000116",
          audit_number: "000116",
          raw_response: {
            reverse: { ResponseCode: "00" },
            step1: { PayerAuthentication: { ReferenceId: "ref-prev" } },
            threeDS: { referenceId: "ref-prev", step: "2" }
          }
        }),
        updatePaymentAfterGatewayStep: async (_id, payload) => ({
          rows: [{ id: 22, submission_id: 52, status: payload.paymentStatus, raw_response: payload.rawResponse }]
        })
      },
      "../services/paymentPayloadService.js": {
        buildBasePayload: () => createBasePayload(),
        buildStandardSalePayload: () => createBasePayload()
      }
    },
    "../services/paymentOrchestrator.js"
  );

  const result = await orchestrator.continuePayment(22, {}, { shopperIP: "127.0.0.1", browserData: {} });
  assert.equal(result.body.status, "reversed");
  assert.equal(reverseCalls, 0);
});

test("continuePayment ambiguous reverse rejection ends in timeout", async () => {
  const realGateway = require("../services/paymentGatewayService");
  const orchestrator = withModuleMocks(
    {
      "../services/paymentGatewayService.js": {
        ...realGateway,
        dispatchPayment: async () => {
          throw buildGatewayError({
            code: "ECONNRESET",
            hadRequest: true
          });
        },
        executeAutomaticReverse: async () => ({ ResponseCode: "05" })
      },
      "../services/paymentPersistenceService.js": {
        getNextSystemsTraceNo: async () => "000117",
        insertPayment: async () => ({ rows: [] }),
        getSubmissionPaymentData: async () => ({ correo: "test@demo.com" }),
        getPaymentById: async () => ({
          id: 23,
          submission_id: 53,
          status: "pending_3ds",
          amount: "1400.00",
          transaction_id: "000117",
          audit_number: "000117",
          raw_response: {
            step1: { PayerAuthentication: { ReferenceId: "ref-prev" } },
            threeDS: { referenceId: "ref-prev", step: "2" }
          }
        }),
        updatePaymentAfterGatewayStep: async (_id, payload) => ({
          rows: [{ id: 23, submission_id: 53, status: payload.paymentStatus, raw_response: payload.rawResponse }]
        })
      },
      "../services/paymentPayloadService.js": {
        buildBasePayload: () => createBasePayload(),
        buildStandardSalePayload: () => createBasePayload()
      }
    },
    "../services/paymentOrchestrator.js"
  );

  const result = await orchestrator.continuePayment(23, {}, { shopperIP: "127.0.0.1", browserData: {} });
  assert.equal(result.body.status, "timeout");
});

test("continuePayment ambiguous reverse pre-dispatch error ends in timeout", async () => {
  const realGateway = require("../services/paymentGatewayService");
  const orchestrator = withModuleMocks(
    {
      "../services/paymentGatewayService.js": {
        ...realGateway,
        dispatchPayment: async () => {
          throw buildGatewayError({
            code: "ECONNRESET",
            hadRequest: true
          });
        },
        executeAutomaticReverse: async () => {
          throw buildGatewayError({
            code: "ENOTFOUND",
            hadRequest: false
          });
        }
      },
      "../services/paymentPersistenceService.js": {
        getNextSystemsTraceNo: async () => "000118",
        insertPayment: async () => ({ rows: [] }),
        getSubmissionPaymentData: async () => ({ correo: "test@demo.com" }),
        getPaymentById: async () => ({
          id: 24,
          submission_id: 54,
          status: "challenge_required",
          amount: "1400.00",
          transaction_id: "000118",
          audit_number: "000118",
          raw_response: {
            step1: { PayerAuthentication: { ReferenceId: "ref-prev" } },
            threeDS: { referenceId: "ref-prev", step: "5" }
          }
        }),
        updatePaymentAfterGatewayStep: async (_id, payload) => ({
          rows: [{ id: 24, submission_id: 54, status: payload.paymentStatus, raw_response: payload.rawResponse }]
        })
      },
      "../services/paymentPayloadService.js": {
        buildBasePayload: () => createBasePayload(),
        buildStandardSalePayload: () => createBasePayload()
      }
    },
    "../services/paymentOrchestrator.js"
  );

  const result = await orchestrator.continuePayment(24, {}, { shopperIP: "127.0.0.1", browserData: {} });
  assert.equal(result.body.status, "timeout");
});
