const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function buildThreeDSResponse({
  responseCode = "00",
  step = "",
  referenceId = "",
  accessToken = "",
  deviceDataCollectionUrl = "",
  extraPayerAuthentication = {}
} = {}) {
  return {
    ResponseCode: responseCode,
    SystemsTraceNo: "000777",
    PrivateUse63: {
      AlternateHostResponse22: "TEST"
    },
    PayerAuthentication: {
      Step: step,
      ReferenceId: referenceId,
      AccessToken: accessToken,
      DeviceDataCollectionUrl: deviceDataCollectionUrl,
      ...extraPayerAuthentication
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

const {
  evaluateThreeDSResult,
  normalizeThreeDSStep
} = require("../services/paymentThreeDSService");

const unitCases = [
  {
    name: "step1 responseCode 00 with complete DDC resolves pending_3ds",
    input: {
      requestedStep: "1",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "2",
        referenceId: "ref-123",
        accessToken: "jwt-123",
        deviceDataCollectionUrl: "https://ddc.test"
      })
    },
    expected: { status: "pending_3ds", reason: "step1_pending" }
  },
  {
    name: "step1 responseCode 10 with complete DDC resolves pending_3ds",
    input: {
      requestedStep: "1",
      neoResponse: buildThreeDSResponse({
        responseCode: "10",
        step: "2",
        referenceId: "ref-123",
        accessToken: "jwt-123",
        deviceDataCollectionUrl: "https://ddc.test"
      })
    },
    expected: { status: "pending_3ds", reason: "step1_pending" }
  },
  {
    name: "step1 missing ReferenceId resolves timeout",
    input: {
      requestedStep: "1",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "2",
        accessToken: "jwt-123",
        deviceDataCollectionUrl: "https://ddc.test"
      })
    },
    expected: { status: "timeout", reason: "step1_incomplete" }
  },
  {
    name: "step1 missing AccessToken resolves timeout",
    input: {
      requestedStep: "1",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "2",
        referenceId: "ref-123",
        deviceDataCollectionUrl: "https://ddc.test"
      })
    },
    expected: { status: "timeout", reason: "step1_incomplete" }
  },
  {
    name: "step1 missing DeviceDataCollectionUrl resolves timeout",
    input: {
      requestedStep: "1",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "2",
        referenceId: "ref-123",
        accessToken: "jwt-123"
      })
    },
    expected: { status: "timeout", reason: "step1_incomplete" }
  },
  {
    name: "step1 empty step without final evidence resolves timeout",
    input: {
      requestedStep: "1",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "",
        referenceId: "",
        accessToken: ""
      })
    },
    expected: { status: "timeout", reason: "step1_incomplete" }
  },
  {
    name: "step1 rejected responseCode resolves rejected",
    input: {
      requestedStep: "1",
      neoResponse: buildThreeDSResponse({ responseCode: "05", step: "2" })
    },
    expected: { status: "rejected", reason: "gateway_rejected" }
  },
  {
    name: "step1 responseCode 91 resolves timeout",
    input: {
      requestedStep: "1",
      neoResponse: buildThreeDSResponse({ responseCode: "91", step: "2" })
    },
    expected: { status: "timeout", reason: "gateway_timeout" }
  },
  {
    name: "step3 response Step 4 resolves challenge_required",
    input: {
      requestedStep: "3",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "4",
        referenceId: "ref-prev",
        accessToken: "jwt-123"
      })
    },
    expected: { status: "challenge_required", reason: "step3_challenge" }
  },
  {
    name: "step3 challenge responseCode 10 resolves challenge_required",
    input: {
      requestedStep: "3",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({
        responseCode: "10",
        step: "5",
        referenceId: "ref-prev",
        accessToken: "jwt-123"
      })
    },
    expected: { status: "challenge_required", reason: "step3_challenge" }
  },
  {
    name: "step3 challenge missing AccessToken resolves timeout",
    input: {
      requestedStep: "3",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "5",
        referenceId: "ref-prev"
      })
    },
    expected: { status: "timeout", reason: "step3_challenge_incomplete" }
  },
  {
    name: "step3 challenge missing current and stored ReferenceId resolves timeout",
    input: {
      requestedStep: "3",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "5",
        accessToken: "jwt-123"
      })
    },
    expected: { status: "timeout", reason: "step3_challenge_incomplete" }
  },
  {
    name: "step3 frictionless responseCode 00 resolves approved",
    input: {
      requestedStep: "3",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "",
        referenceId: "ref-prev"
      })
    },
    expected: { status: "approved", reason: "step3_frictionless_approved" }
  },
  {
    name: "step3 frictionless responseCode 10 resolves approved",
    input: {
      requestedStep: "3",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({
        responseCode: "10",
        step: "",
        referenceId: "ref-prev"
      })
    },
    expected: { status: "approved", reason: "step3_frictionless_approved" }
  },
  {
    name: "step3 frictionless without AccessToken still resolves approved",
    input: {
      requestedStep: "3",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "",
        referenceId: "ref-prev",
        accessToken: ""
      })
    },
    expected: { status: "approved", reason: "step3_frictionless_approved" }
  },
  {
    name: "step3 unexpected Step 2 resolves timeout",
    input: {
      requestedStep: "3",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "2",
        referenceId: "ref-prev"
      })
    },
    expected: { status: "timeout", reason: "step3_contradictory" }
  },
  {
    name: "step3 different ReferenceId resolves timeout",
    input: {
      requestedStep: "3",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "",
        referenceId: "ref-other"
      })
    },
    expected: { status: "timeout", reason: "reference_id_mismatch" }
  },
  {
    name: "step3 rejected responseCode resolves rejected",
    input: {
      requestedStep: "3",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({ responseCode: "05", step: "" })
    },
    expected: { status: "rejected", reason: "gateway_rejected" }
  },
  {
    name: "step3 responseCode 91 resolves timeout",
    input: {
      requestedStep: "3",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({ responseCode: "91", step: "" })
    },
    expected: { status: "timeout", reason: "gateway_timeout" }
  },
  {
    name: "step5 responseCode 00 final coherent resolves approved",
    input: {
      requestedStep: "5",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "",
        referenceId: ""
      })
    },
    expected: { status: "approved", reason: "step5_approved" }
  },
  {
    name: "step5 responseCode 10 final coherent resolves approved",
    input: {
      requestedStep: "5",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({
        responseCode: "10",
        step: "",
        referenceId: ""
      })
    },
    expected: { status: "approved", reason: "step5_approved" }
  },
  {
    name: "step5 without AccessToken final coherent still resolves approved",
    input: {
      requestedStep: "5",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "",
        accessToken: ""
      })
    },
    expected: { status: "approved", reason: "step5_approved" }
  },
  {
    name: "step5 response Step 5 approved resolves approved",
    input: {
      requestedStep: "5",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "5",
        referenceId: "",
        accessToken: ""
      })
    },
    expected: { status: "approved", reason: "step5_approved" }
  },
  {
    name: "step5 incompatible step resolves timeout",
    input: {
      requestedStep: "5",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "3",
        referenceId: "ref-prev"
      })
    },
    expected: { status: "timeout", reason: "step5_incomplete" }
  },
  {
    name: "step5 different ReferenceId resolves timeout",
    input: {
      requestedStep: "5",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({
        responseCode: "00",
        step: "",
        referenceId: "ref-other"
      })
    },
    expected: { status: "timeout", reason: "reference_id_mismatch" }
  },
  {
    name: "step5 rejected responseCode resolves rejected",
    input: {
      requestedStep: "5",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({ responseCode: "05", step: "" })
    },
    expected: { status: "rejected", reason: "gateway_rejected" }
  },
  {
    name: "step5 responseCode 91 resolves timeout",
    input: {
      requestedStep: "5",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({ responseCode: "91", step: "" })
    },
    expected: { status: "timeout", reason: "gateway_timeout" }
  },
  {
    name: "missing ResponseCode resolves timeout",
    input: {
      requestedStep: "3",
      storedReferenceId: "ref-prev",
      neoResponse: buildThreeDSResponse({ responseCode: "", step: "" })
    },
    expected: { status: "timeout", reason: "missing_response_code" }
  }
];

for (const testCase of unitCases) {
  test(testCase.name, () => {
    const result = evaluateThreeDSResult(testCase.input);
    assert.equal(result.status, testCase.expected.status);
    assert.equal(result.reason, testCase.expected.reason);
  });
}

test("numeric Step 2 is normalized correctly", () => {
  const result = evaluateThreeDSResult({
    requestedStep: 1,
    neoResponse: buildThreeDSResponse({
      responseCode: "00",
      step: 2,
      referenceId: "ref-123",
      accessToken: "jwt-123",
      deviceDataCollectionUrl: "https://ddc.test"
    })
  });

  assert.equal(result.responseStep, "2");
  assert.equal(result.status, "pending_3ds");
});

test("numeric Step 5 is normalized correctly", () => {
  const result = evaluateThreeDSResult({
    requestedStep: 3,
    storedReferenceId: "ref-prev",
    neoResponse: buildThreeDSResponse({
      responseCode: "00",
      step: 5,
      referenceId: "ref-prev",
      accessToken: "jwt-123"
    })
  });

  assert.equal(result.responseStep, "5");
  assert.equal(result.status, "challenge_required");
});

test("null Step does not throw", () => {
  const result = evaluateThreeDSResult({
    requestedStep: 3,
    storedReferenceId: "ref-prev",
    neoResponse: buildThreeDSResponse({
      responseCode: "00",
      step: null,
      referenceId: "ref-prev"
    })
  });

  assert.equal(result.status, "approved");
});

test("missing PayerAuthentication does not throw", () => {
  const result = evaluateThreeDSResult({
    requestedStep: 3,
    storedReferenceId: "ref-prev",
    neoResponse: {
      ResponseCode: "00",
      SystemsTraceNo: "000777",
      PrivateUse63: { AlternateHostResponse22: "TEST" }
    }
  });

  assert.equal(result.status, "approved");
});

test("null or undefined response does not throw and never resolves approved", () => {
  const nullResult = evaluateThreeDSResult({
    requestedStep: "3",
    neoResponse: null
  });
  const undefinedResult = evaluateThreeDSResult({
    requestedStep: "5",
    neoResponse: undefined
  });

  assert.equal(nullResult.status, "timeout");
  assert.equal(undefinedResult.status, "timeout");
});

test("evaluation result never returns full AccessToken", () => {
  const result = evaluateThreeDSResult({
    requestedStep: "3",
    storedReferenceId: "ref-prev",
    neoResponse: buildThreeDSResponse({
      responseCode: "00",
      step: "5",
      referenceId: "ref-prev",
      accessToken: "jwt-123"
    })
  });

  assert.equal(Object.prototype.hasOwnProperty.call(result, "accessToken"), false);
  assert.equal(JSON.stringify(result).includes("jwt-123"), false);
});

test("reason codes are stable and controlled", () => {
  const observedReasons = new Set(
    unitCases.map((testCase) => evaluateThreeDSResult(testCase.input).reason)
  );
  const expectedReasons = new Set([
    "step1_pending",
    "step1_incomplete",
    "step3_challenge",
    "step3_challenge_incomplete",
    "step3_frictionless_approved",
    "step3_contradictory",
    "step5_approved",
    "step5_incomplete",
    "gateway_rejected",
    "gateway_timeout",
    "missing_response_code",
    "reference_id_mismatch"
  ]);

  assert.deepEqual(observedReasons, expectedReasons);
});

test("createPayment uses the central 3DS evaluator for step 1", async () => {
  const insertCalls = [];
  const orchestrator = withModuleMocks(
    {
      "../services/paymentGatewayService.js": {
        dispatchPayment: async () => buildThreeDSResponse({
          responseCode: "00",
          step: "2"
        }),
        mapGatewayError: (error) => ({
          statusCode: 500,
          message: error?.message || "error",
          detail: null
        }),
        executeAutomaticReverse: async () => ({ ResponseCode: "00" })
      },
      "../services/paymentPersistenceService.js": {
        getNextSystemsTraceNo: async () => "000777",
        getSubmissionPaymentData: async () => ({ correo: "test@demo.com" }),
        insertPayment: async (payload) => {
          insertCalls.push(payload);
          return {
            rows: [
              {
                id: 501,
                submission_id: payload.submission_id,
                status: payload.paymentStatus,
                raw_response: payload.rawResponse
              }
            ]
          };
        },
        getPaymentById: async () => null,
        updatePaymentAfterGatewayStep: async () => ({ rows: [] })
      },
      "../services/paymentPayloadService.js": {
        buildBasePayload: () => createBasePayload(),
        buildStandardSalePayload: () => createBasePayload()
      },
      "../services/paymentThreeDSService.js": {
        ...require("../services/paymentThreeDSService"),
        buildThreeDSStep1Payload: () => createBasePayload(),
        buildThreeDSStepPayload: () => createBasePayload()
      }
    },
    "../services/paymentOrchestrator.js"
  );

  const result = await orchestrator.createPayment(
    {
      submission_id: 77,
      amount: 1400,
      card_number: "4456530000001005",
      expiration_date: "2912",
      cvv: "123",
      cardholder_name: "JUAN PEREZ",
      email: "test@demo.com"
    },
    {
      shopperIP: "127.0.0.1",
      browserData: {}
    }
  );

  assert.equal(result.body.status, "timeout");
  assert.equal(insertCalls[0].paymentStatus, "timeout");
  assert.equal(insertCalls[0].rawResponse.threeDS.evaluationReason, "step1_incomplete");
});

test("continuePayment uses the central 3DS evaluator for step 3", async () => {
  let automaticReverseCalls = 0;
  const orchestrator = withModuleMocks(
    {
      "../services/paymentGatewayService.js": {
        dispatchPayment: async () => buildThreeDSResponse({
          responseCode: "00",
          step: "2",
          referenceId: "ref-prev"
        }),
        mapGatewayError: (error) => ({
          statusCode: 500,
          message: error?.message || "error",
          detail: null
        }),
        executeAutomaticReverse: async () => {
          automaticReverseCalls += 1;
          return { ResponseCode: "00" };
        }
      },
      "../services/paymentPersistenceService.js": {
        getNextSystemsTraceNo: async () => "000777",
        insertPayment: async () => ({ rows: [] }),
        getSubmissionPaymentData: async () => ({ correo: "test@demo.com" }),
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
                ReferenceId: "ref-prev"
              }
            },
            threeDS: {
              referenceId: "ref-prev",
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
        ...require("../services/paymentThreeDSService"),
        buildThreeDSStep1Payload: () => createBasePayload(),
        buildThreeDSStepPayload: () => createBasePayload()
      }
    },
    "../services/paymentOrchestrator.js"
  );

  const result = await orchestrator.continuePayment(88, {}, {
    shopperIP: "127.0.0.1",
    browserData: {}
  });

  assert.equal(result.body.status, "timeout");
  assert.equal(result.body.payment.raw_response.threeDS.evaluationReason, "step3_contradictory");
  assert.equal(automaticReverseCalls, 0);
});

test("no 3DS route remains where responseCode alone approves an incomplete challenge", async () => {
  const orchestrator = withModuleMocks(
    {
      "../services/paymentGatewayService.js": {
        dispatchPayment: async () => buildThreeDSResponse({
          responseCode: "00",
          step: "5",
          referenceId: "ref-prev",
          accessToken: ""
        }),
        mapGatewayError: (error) => ({
          statusCode: 500,
          message: error?.message || "error",
          detail: null
        }),
        executeAutomaticReverse: async () => ({ ResponseCode: "00" })
      },
      "../services/paymentPersistenceService.js": {
        getNextSystemsTraceNo: async () => "000777",
        insertPayment: async () => ({ rows: [] }),
        getSubmissionPaymentData: async () => ({ correo: "test@demo.com" }),
        getPaymentById: async () => ({
          id: 89,
          submission_id: 901,
          status: "pending_3ds",
          amount: "1400.00",
          transaction_id: "000457",
          audit_number: "000457",
          raw_response: {
            latest: {
              SystemsTraceNo: "000457",
              PayerAuthentication: {
                ReferenceId: "ref-prev"
              }
            },
            threeDS: {
              referenceId: "ref-prev",
              step: "2"
            }
          }
        }),
        updatePaymentAfterGatewayStep: async (_paymentId, payload) => ({
          rows: [
            {
              id: 89,
              submission_id: 901,
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
        ...require("../services/paymentThreeDSService"),
        buildThreeDSStep1Payload: () => createBasePayload(),
        buildThreeDSStepPayload: () => createBasePayload()
      }
    },
    "../services/paymentOrchestrator.js"
  );

  const result = await orchestrator.continuePayment(89, {}, {
    shopperIP: "127.0.0.1",
    browserData: {}
  });

  assert.equal(result.body.status, "timeout");
  assert.equal(result.body.payment.raw_response.threeDS.evaluationReason, "step3_challenge_incomplete");
});

test("normal sale keeps the existing approval path", async () => {
  const previousCards = process.env.NEOPAY_3DS_TEST_CARDS;
  process.env.NEOPAY_3DS_TEST_CARDS = "4456530000001005";

  try {
    const insertCalls = [];
    const orchestrator = withModuleMocks(
      {
        "../services/paymentGatewayService.js": {
          dispatchPayment: async () => ({
            ResponseCode: "00",
            RetrievalRefNo: "620411000111",
            AuthIdResponse: "018952",
            SystemsTraceNo: "000888",
            PrivateUse63: {
              AlternateHostResponse22: "SUCCESS"
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
          getNextSystemsTraceNo: async () => "000888",
          insertPayment: async (payload) => {
            insertCalls.push(payload);
            return {
              rows: [
                {
                  id: 777,
                  submission_id: payload.submission_id,
                  status: payload.paymentStatus
                }
              ]
            };
          },
          getPaymentById: async () => null,
          getSubmissionPaymentData: async () => ({}),
          updatePaymentAfterGatewayStep: async () => ({ rows: [] })
        },
        "../services/paymentPayloadService.js": {
          buildBasePayload: () => createBasePayload(),
          buildStandardSalePayload: () => createBasePayload()
        },
        "../services/paymentThreeDSService.js": {
          ...require("../services/paymentThreeDSService"),
          evaluateThreeDSResult: () => {
            throw new Error("should not be called for normal sale");
          }
        }
      },
      "../services/paymentOrchestrator.js"
    );

    const result = await orchestrator.createPayment(
      {
        submission_id: 55,
        amount: 1400,
        card_number: "4111111111110416",
        expiration_date: "2912",
        cvv: "123",
        cardholder_name: "JUAN PEREZ"
      },
      {
        shopperIP: "127.0.0.1",
        browserData: {}
      }
    );

    assert.equal(result.body.status, "approved");
    assert.equal(insertCalls[0].paymentStatus, "approved");
  } finally {
    process.env.NEOPAY_3DS_TEST_CARDS = previousCards;
  }
});

test("step1 pending preserves diagnostics without full token exposure", () => {
  const result = evaluateThreeDSResult({
    requestedStep: "1",
    neoResponse: buildThreeDSResponse({
      responseCode: "00",
      step: "2",
      referenceId: "ref-123",
      accessToken: "jwt-123",
      deviceDataCollectionUrl: "https://ddc.test"
    })
  });

  assert.equal(result.hasAccessToken, true);
  assert.equal(result.hasDeviceDataCollectionUrl, true);
  assert.equal(result.referenceId, "ref-123");
  assert.equal(JSON.stringify(result).includes("jwt-123"), false);
});
