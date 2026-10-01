const test = require("node:test");
const assert = require("node:assert/strict");
const { getShopperIp, normalizeShopperIp } = require("../services/paymentHelpersService");

test("normaliza el loopback IPv6 para el header ShopperIP de NeoNet", () => {
  assert.equal(normalizeShopperIp("::1"), "127.0.0.1");
  assert.equal(getShopperIp({ headers: {}, ip: "::1" }), "127.0.0.1");
});

test("conserva IPv4 real y convierte IPv4 mapeado por IPv6", () => {
  assert.equal(getShopperIp({ headers: {}, ip: "192.0.2.25" }), "192.0.2.25");
  assert.equal(getShopperIp({ headers: {}, ip: "::ffff:192.0.2.25" }), "192.0.2.25");
  assert.equal(
    getShopperIp({ headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" }, ip: "::1" }),
    "198.51.100.7"
  );
});
