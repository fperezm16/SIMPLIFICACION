function summarizeResponse(value, depth) {
  if (depth > 4) return { format: "depth_limit" };
  let parsed = value;
  let format = "object";
  if (typeof value === "string") {
    if (value.length > 65536) return { format: "too_large" };
    try {
      parsed = JSON.parse(value);
      format = "json";
    } catch {
      try {
        const parts = value.split(".");
        const encoded = parts.length === 3 ? parts[1] : value;
        if (!/^[A-Za-z0-9+/_=-]+$/.test(encoded)) throw new Error("unsupported");
        parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
        format = parts.length === 3 ? "jwt_payload_unverified" : "base64_json";
      } catch {
        return { format: "unrecognized", content_logged: false };
      }
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { format: "unsupported", content_logged: false };
  }
  // Decoding is diagnostic only; it does not authenticate a callback or authorize a payment.
  return { format, trusted: false, ...summarizeReturnFields(parsed, depth) };
}

function summarizeReturnFields(fields, depth = 0) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return { keys: [], statuses: {}, has_jwt: false, has_transaction_id: false };
  }
  const statuses = {};
  const allowed = new Set([
    "status", "success", "errornumber", "errorcode", "responsecode",
    "actioncode", "transstatus", "paresstatus", "validated"
  ]);
  const keys = Object.keys(fields);
  for (const key of keys) {
    const normalized = key.toLowerCase();
    if (!allowed.has(normalized)) continue;
    const value = fields[key];
    statuses[key] = ["string", "number", "boolean"].includes(typeof value)
      && /^[a-zA-Z0-9_-]{1,32}$/.test(String(value))
      ? value : "[OMITTED]";
  }
  const nested = {};
  if (depth < 4) {
    for (const key of ["Response", "Payload", "Payment", "ExtendedData"]) {
      if (Object.hasOwn(fields, key)) nested[key] = summarizeResponse(fields[key], depth + 1);
    }
  }
  return {
    keys: keys.slice(0, 40).map(key => key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)),
    statuses,
    nested,
    has_jwt: keys.some(key => /^(jwt|accesstoken)$/i.test(key)),
    has_transaction_id: keys.some(key => /^(transactionid|referenceid)$/i.test(key))
  };
}

module.exports = { summarizeReturnFields };
