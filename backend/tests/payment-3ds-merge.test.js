const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  mergeThreeDSRawResponse
} = require("../services/paymentThreeDSService");
const {
  isLikelyNeoNetResponseBody
} = require("../services/neonetService");

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

function createHistoricalRawResponse() {
  return {
    flow: "3ds",
    latest: {
      ResponseCode: "00",
      SystemsTraceNo: "000111",
      PayerAuthentication: {
        Step: "2",
        ReferenceId: "ref-original",
        AccessToken: "token-original",
        DeviceDataCollectionUrl: "https://example.com/ddc"
      }
    },
    step1: {
      ResponseCode: "00",
      SystemsTraceNo: "000111",
      PayerAuthentication: {
        Step: "2",
        ReferenceId: "ref-original",
        AccessToken: "token-original",
        DeviceDataCollectionUrl: "https://example.com/ddc"
      }
    },
    step3: {
      ResponseCode: "00",
      SystemsTraceNo: "000111",
      PayerAuthentication: {
        Step: "5",
        ReferenceId: "ref-original",
        AccessToken: "token-step3"
      }
    },
    threeDS: {
      referenceId: "ref-original",
      accessToken: "token-original",
      deviceDataCollectionUrl: "https://example.com/ddc",
      step: "5",
      currentStatus: "challenge_required",
      stepUpUrl: "https://step-up",
      returnUrl: "https://return"
    },
    reverse: {
      ResponseCode: "00",
      SystemsTraceNo: "000222"
    },
    gatewayFailure: {
      category: "gateway_timeout_response",
      code: "91",
      reversalAttempted: true,
      reversalApproved: true,
      correlationAvailable: true,
      systemsTraceNo: "000111"
    },
    customArray: [{ value: 1 }]
  };
}

test("mergeThreeDSRawResponse does not mutate previous raw_response or incoming fragment", () => {
  const previous = createHistoricalRawResponse();
  const incoming = {
    latest: {
      ResponseCode: "00",
      SystemsTraceNo: "000111",
      PayerAuthentication: {
        Step: "6",
        ReferenceId: "ref-original"
      }
    },
    step5: {
      ResponseCode: "00",
      SystemsTraceNo: "000111",
      PayerAuthentication: {
        Step: "6",
        ReferenceId: "ref-original"
      }
    },
    threeDS: {
      step: "6",
      currentStatus: "approved"
    }
  };

  const previousSnapshot = JSON.stringify(previous);
  const incomingSnapshot = JSON.stringify(incoming);
  const merged = mergeThreeDSRawResponse(previous, incoming);

  assert.equal(JSON.stringify(previous), previousSnapshot);
  assert.equal(JSON.stringify(incoming), incomingSnapshot);
  assert.notEqual(merged, previous);
  assert.notEqual(merged.threeDS, previous.threeDS);
  assert.notEqual(merged.customArray, previous.customArray);
});

test("latest is updated with useful event but not replaced by null undefined or empty object", () => {
  const previous = createHistoricalRawResponse();

  const keepUndefined = mergeThreeDSRawResponse(previous, { latest: undefined });
  const keepNull = mergeThreeDSRawResponse(previous, { latest: null });
  const keepEmpty = mergeThreeDSRawResponse(previous, { latest: {} });
  const replaceUseful = mergeThreeDSRawResponse(previous, {
    latest: {
      ResponseCode: "10",
      SystemsTraceNo: "000333",
      PayerAuthentication: {
        Step: "6",
        ReferenceId: "ref-original"
      }
    }
  });

  assert.equal(keepUndefined.latest.SystemsTraceNo, "000111");
  assert.equal(keepNull.latest.SystemsTraceNo, "000111");
  assert.equal(keepEmpty.latest.SystemsTraceNo, "000111");
  assert.equal(replaceUseful.latest.SystemsTraceNo, "000333");
});

test("flow preserves useful value and can upgrade with useful incoming value", () => {
  const previous = createHistoricalRawResponse();

  const kept = mergeThreeDSRawResponse(previous, { flow: "" });
  const upgraded = mergeThreeDSRawResponse({ flow: "" }, { flow: "3ds" });

  assert.equal(kept.flow, "3ds");
  assert.equal(upgraded.flow, "3ds");
});

test("historical step1 step3 and step5 are preserved across subsequent merges", () => {
  const afterStep3 = mergeThreeDSRawResponse(
    {
      flow: "3ds",
      step1: createHistoricalRawResponse().step1,
      threeDS: {
        referenceId: "ref-original",
        step: "2",
        currentStatus: "pending_3ds"
      }
    },
    {
      latest: createHistoricalRawResponse().step3,
      step3: createHistoricalRawResponse().step3,
      threeDS: {
        referenceId: "ref-original",
        step: "5",
        currentStatus: "challenge_required"
      }
    }
  );

  const afterStep5 = mergeThreeDSRawResponse(afterStep3, {
    latest: {
      ResponseCode: "00",
      SystemsTraceNo: "000111",
      PayerAuthentication: {
        Step: "6",
        ReferenceId: "ref-original"
      }
    },
    step5: {
      ResponseCode: "00",
      SystemsTraceNo: "000111",
      PayerAuthentication: {
        Step: "6",
        ReferenceId: "ref-original"
      }
    },
    threeDS: {
      step: "6",
      currentStatus: "approved"
    }
  });

  const afterReverse = mergeThreeDSRawResponse(afterStep5, {
    reverse: {
      ResponseCode: "00",
      SystemsTraceNo: "000222"
    }
  });

  assert.ok(afterReverse.step1);
  assert.ok(afterReverse.step3);
  assert.ok(afterReverse.step5);
  assert.equal(afterReverse.reverse.ResponseCode, "00");
});

test("step sections are not replaced by empty values or by another step", () => {
  const previous = {
    step1: { ResponseCode: "00" },
    step3: { ResponseCode: "00", marker: "step3" },
    step5: { ResponseCode: "00", marker: "step5" }
  };

  const merged = mergeThreeDSRawResponse(previous, {
    step1: {},
    step3: null,
    step5: undefined
  });

  assert.equal(merged.step1.ResponseCode, "00");
  assert.equal(merged.step3.marker, "step3");
  assert.equal(merged.step5.marker, "step5");
});

test("ReferenceId preserves original on empty null or mismatch and leaves technical evidence", () => {
  const previous = createHistoricalRawResponse();

  const empty = mergeThreeDSRawResponse(previous, {
    threeDS: { referenceId: "" }
  });
  const nil = mergeThreeDSRawResponse(previous, {
    threeDS: { referenceId: null }
  });
  const mismatch = mergeThreeDSRawResponse(previous, {
    threeDS: { referenceId: "ref-contradictorio" }
  });

  assert.equal(empty.threeDS.referenceId, "ref-original");
  assert.equal(nil.threeDS.referenceId, "ref-original");
  assert.equal(mismatch.threeDS.referenceId, "ref-original");
  assert.equal(mismatch.threeDS.referenceIdMismatch, true);
});

test("AccessToken and DeviceDataCollectionUrl preserve useful historical values", () => {
  const previous = createHistoricalRawResponse();
  const merged = mergeThreeDSRawResponse(previous, {
    threeDS: {
      accessToken: "",
      deviceDataCollectionUrl: ""
    }
  });

  assert.equal(merged.threeDS.accessToken, "token-original");
  assert.equal(
    merged.threeDS.deviceDataCollectionUrl,
    "https://example.com/ddc"
  );
});

test("threeDS step and currentStatus do not regress incoherently", () => {
  const previous = createHistoricalRawResponse();
  const merged = mergeThreeDSRawResponse(previous, {
    threeDS: {
      step: "2",
      currentStatus: "pending_3ds"
    }
  });

  assert.equal(merged.threeDS.step, "5");
  assert.equal(merged.threeDS.currentStatus, "challenge_required");
});

test("approved does not regress to pending and timeout can advance to reversed only with approved reverse", () => {
  const approved = mergeThreeDSRawResponse(
    {
      threeDS: {
        currentStatus: "approved"
      }
    },
    {
      threeDS: {
        currentStatus: "pending_3ds"
      }
    }
  );

  const timeoutNoReverse = mergeThreeDSRawResponse(
    {
      threeDS: {
        currentStatus: "timeout"
      }
    },
    {
      threeDS: {
        currentStatus: "timeout"
      },
      reverse: {
        ResponseCode: "05"
      }
    }
  );

  const timeoutToReversed = mergeThreeDSRawResponse(
    {
      threeDS: {
        currentStatus: "timeout"
      }
    },
    {
      threeDS: {
        currentStatus: "reversed"
      },
      reverse: {
        ResponseCode: "00"
      }
    }
  );

  assert.equal(approved.threeDS.currentStatus, "approved");
  assert.equal(timeoutNoReverse.threeDS.currentStatus, "timeout");
  assert.equal(timeoutToReversed.threeDS.currentStatus, "reversed");
});

test("approved reverse is preserved and reverse_error does not delete it", () => {
  const previous = createHistoricalRawResponse();
  const merged = mergeThreeDSRawResponse(previous, {
    reverse: {},
    reverse_error: {
      category: "dns_error",
      safeMessage: "fallo"
    }
  });

  assert.equal(merged.reverse.ResponseCode, "00");
  assert.equal(merged.reverse_error.category, "dns_error");
});

test("gatewayFailure preserves structured evidence and does not get replaced by empty object", () => {
  const previous = createHistoricalRawResponse();
  const merged = mergeThreeDSRawResponse(previous, {
    gatewayFailure: {
      category: "",
      reversalAttempted: false
    }
  });

  assert.equal(merged.gatewayFailure.category, "gateway_timeout_response");
  assert.equal(merged.gatewayFailure.reversalApproved, true);
  assert.equal(merged.gatewayFailure.reversalAttempted, true);
});

test("raw_response null undefined and historical legacy layouts remain compatible", () => {
  const fromNull = mergeThreeDSRawResponse(null, {
    latest: { ResponseCode: "00" }
  });
  const fromUndefined = mergeThreeDSRawResponse(undefined, {
    threeDS: { referenceId: "ref-new" }
  });
  const legacyRootReverse = mergeThreeDSRawResponse(
    {
      reverse: { ResponseCode: "00" }
    },
    {
      latest: { ResponseCode: "91" }
    }
  );
  const legacyLatestReverse = mergeThreeDSRawResponse(
    {
      latest: {
        ResponseCode: "91",
        reverse: { ResponseCode: "00" }
      }
    },
    {
      latest: {
        ResponseCode: "00",
        SystemsTraceNo: "000999"
      }
    }
  );

  assert.equal(fromNull.latest.ResponseCode, "00");
  assert.equal(fromUndefined.threeDS.referenceId, "ref-new");
  assert.equal(legacyRootReverse.reverse.ResponseCode, "00");
  assert.equal(legacyLatestReverse.latest.reverse.ResponseCode, "00");
});

test("isLikelyNeoNetResponseBody accepts only plausible NeoNet business bodies", () => {
  assert.equal(
    isLikelyNeoNetResponseBody({
      ResponseCode: "91",
      MessageTypeId: "0210",
      SystemsTraceNo: "000301",
      PayerAuthentication: {}
    }),
    true
  );
  assert.equal(
    isLikelyNeoNetResponseBody({
      ResponseCode: "05",
      Merchant: { TerminalId: "99585858" },
      PrivateUse63: { AlternateHostResponse22: "DENIED" }
    }),
    true
  );
  assert.equal(
    isLikelyNeoNetResponseBody({
      ResponseCode: "00",
      PayerAuthentication: {
        Step: "5",
        ReferenceId: "ref-original"
      }
    }),
    true
  );
  assert.equal(isLikelyNeoNetResponseBody("<html>proxy</html>"), false);
  assert.equal(isLikelyNeoNetResponseBody("gateway timeout"), false);
  assert.equal(isLikelyNeoNetResponseBody({}), false);
  assert.equal(
    isLikelyNeoNetResponseBody({
      status: 500,
      message: "proxy"
    }),
    false
  );
  assert.equal(
    isLikelyNeoNetResponseBody({
      ResponseCode: "",
      MessageTypeId: "0210"
    }),
    false
  );
});

test("sendTransaction does not accept generic HTTP 5xx bodies as NeoNet responses", async () => {
  const axiosModulePath = resolveFromBackend("axios");
  const neonetService = withModuleMocks(
    {
      [path.relative(__dirname, axiosModulePath)]: {
        post: async () => {
          const error = new Error("proxy");
          error.response = {
            status: 502,
            data: "<html>Bad Gateway</html>"
          };
          throw error;
        }
      }
    },
    "../services/neonetService.js"
  );

  process.env.NEOPAY_URL = "https://test";
  process.env.NEOPAY_MERCHANT_USER = "user";
  process.env.NEOPAY_MERCHANT_PASSWD = "pass";
  process.env.NEOPAY_PAYMENTGW_IP = "1.1.1.1";
  process.env.NEOPAY_MERCHANT_SERVER_IP = "2.2.2.2";

  await assert.rejects(
    () => neonetService.sendTransaction({}, "127.0.0.1"),
    (error) => {
      assert.equal(error.type, "NEONET_HTTP_ERROR");
      assert.equal(error.status, 502);
      return true;
    }
  );
});
