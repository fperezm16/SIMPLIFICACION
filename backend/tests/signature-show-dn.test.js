const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadSignatureProviderService() {
  const targetPath = path.resolve(__dirname, "../services/signatureProviderService.js");
  delete require.cache[targetPath];
  return require(targetPath);
}

function withEnv(overrides, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const restore = () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  const result = callback();
  if (result && typeof result.then === "function") {
    return result.finally(restore);
  }
  restore();
  return result;
}

async function captureRequestFields(envOverrides = {}, signerOverrides = {}) {
  return withEnv(
    {
      SIGNER_PROVIDER_URL: "https://example.test/sign",
      SIGNER_ACCESS_KEY: "access-key",
      SIGNER_SYNC: "true",
      SIGNER_CLOSE: "false",
      SIGNER_DEFAULT_CONCEPT: "Firma de documento",
      SIGNER_DEFAULT_PLACE: "Guatemala, Guatemala",
      SIGNER_REQUEST_TYPE: "PDF Especial",
      SIGNER_APPEARANCE: "GRAPHIC_AND_DESCRIPTION",
      SIGNER_FONT_SIZE: "-2",
      SIGNER_RUBRIC: "",
      SIGNER_SHOW_DN: undefined,
      ...envOverrides
    },
    async () => {
      const service = loadSignatureProviderService();
      const originalFetch = global.fetch;
      const responsePdf = Buffer.from("%PDF-1.4\n%");
      let capturedEntries = [];

      global.fetch = async (_url, options = {}) => {
        capturedEntries = Array.from(options.body.entries());
        return {
          ok: true,
          headers: {
            get(name) {
              if (String(name).toLowerCase() === "content-type") return "application/pdf";
              return "";
            }
          },
          async arrayBuffer() {
            return responsePdf;
          }
        };
      };

      try {
        await service.signPdfWithProvider({
          pdfBuffer: Buffer.from("%PDF test document"),
          filename: "documento.pdf",
          signerEmail: "test@demo.com",
          signerPassword: "12345678",
          pages: "1",
          coordinates: "130 40 420 85",
          ...signerOverrides
        });
      } finally {
        global.fetch = originalFetch;
      }

      const scalarFields = new Map();
      for (const [key, value] of capturedEntries) {
        if (typeof value === "string") {
          scalarFields.set(key, value);
        }
      }

      return {
        config: service.__private.getConfig(),
        scalarFields
      };
    }
  );
}

test("SIGNER_SHOW_DN=false se preserva y se envia como texto false", async () => {
  const { config, scalarFields } = await captureRequestFields({
    SIGNER_SHOW_DN: "false"
  });

  assert.equal(config.showDn, false);
  assert.equal(scalarFields.get("solicitud_firma[show_dn]"), "false");
  assert.equal(scalarFields.get("solicitud_firma[apariencia_firma]"), "GRAPHIC_AND_DESCRIPTION");
  assert.equal(scalarFields.get("solicitud_firma[tipo_solicitud]"), "PDF Especial");
  assert.equal(scalarFields.get("solicitud_firma[concepto]"), "Firma de documento");
  assert.equal(scalarFields.get("solicitud_firma[lugar]"), "Guatemala, Guatemala");
  assert.equal(scalarFields.get("solicitud_firma[coordenadas][][coordenadas]"), "130 40 420 85");
  assert.equal(scalarFields.get("solicitud_firma[font_size]"), "-2");
  assert.equal(scalarFields.has("solicitud_firma[rubrica]"), false);
});

test("SIGNER_SHOW_DN=true se preserva y se envia como texto true", async () => {
  const { config, scalarFields } = await captureRequestFields({
    SIGNER_SHOW_DN: "true"
  });

  assert.equal(config.showDn, true);
  assert.equal(scalarFields.get("solicitud_firma[show_dn]"), "true");
  assert.equal(scalarFields.get("solicitud_firma[apariencia_firma]"), "GRAPHIC_AND_DESCRIPTION");
  assert.equal(scalarFields.has("solicitud_firma[rubrica]"), false);
});

test("SIGNER_SHOW_DN ausente conserva el comportamiento historico y omite el campo", async () => {
  const { config, scalarFields } = await captureRequestFields({
    SIGNER_SHOW_DN: undefined
  });

  assert.equal(config.showDn, undefined);
  assert.equal(scalarFields.has("solicitud_firma[show_dn]"), false);
  assert.equal(scalarFields.get("solicitud_firma[apariencia_firma]"), "GRAPHIC_AND_DESCRIPTION");
});

test("la rubrica institucional es global y conserva identidad y coordenadas por firmante", async () => {
  const rubricBase64 = "RklSTUEgRUxFQ1RST05JQ0EgQVZBTlpBREE=";
  const env = {
    SIGNER_RUBRIC_BASE64: rubricBase64,
    SIGNER_RUBRIC: "fallback-no-utilizado",
    SIGNER_SHOW_DN: "false"
  };

  const first = await captureRequestFields(env, {
    signerEmail: "firmante.uno@demo.com",
    signerPassword: "password-uno",
    pages: "2",
    coordinates: "100 110 300 160"
  });
  const second = await captureRequestFields(env, {
    signerEmail: "firmante.dos@demo.com",
    signerPassword: "password-dos",
    pages: "4",
    coordinates: "200 210 400 260"
  });

  assert.equal(first.scalarFields.get("solicitud_firma[rubrica]"), rubricBase64);
  assert.equal(second.scalarFields.get("solicitud_firma[rubrica]"), rubricBase64);
  assert.equal(first.scalarFields.get("email"), "firmante.uno@demo.com");
  assert.equal(second.scalarFields.get("email"), "firmante.dos@demo.com");
  assert.equal(first.scalarFields.get("password_firma"), "password-uno");
  assert.equal(second.scalarFields.get("password_firma"), "password-dos");
  assert.equal(first.scalarFields.get("solicitud_firma[coordenadas][][paginas]"), "2");
  assert.equal(second.scalarFields.get("solicitud_firma[coordenadas][][paginas]"), "4");
  assert.equal(first.scalarFields.get("solicitud_firma[coordenadas][][coordenadas]"), "100 110 300 160");
  assert.equal(second.scalarFields.get("solicitud_firma[coordenadas][][coordenadas]"), "200 210 400 260");
  assert.equal(first.scalarFields.get("solicitud_firma[show_dn]"), "false");
  assert.equal(second.scalarFields.get("solicitud_firma[show_dn]"), "false");
  assert.equal(first.scalarFields.get("solicitud_firma[tipo_solicitud]"), "PDF Especial");
  assert.equal(second.scalarFields.get("solicitud_firma[tipo_solicitud]"), "PDF Especial");
});

test("el diagnostico de firma no expone secretos y refleja la configuracion requerida", () => {
  withEnv(
    {
      SIGNER_PROVIDER_URL: "https://example.test/sign",
      SIGNER_ACCESS_KEY: "secret-access-key",
      SIGNER_RUBRIC: "base64-rubric",
      SIGNER_SHOW_DN: "false",
      SIGNER_SYNC: "true",
      SIGNER_CLOSE: "true"
    },
    () => {
      const service = loadSignatureProviderService();
      const diagnostics = service.getConfigDiagnostics();

      assert.equal(diagnostics.ok, true);
      assert.deepEqual(diagnostics.checks, {
        provider_url: true,
        access_key: true,
        rubric: true
      });
      assert.equal(diagnostics.settings.show_dn, false);
      assert.equal(diagnostics.settings.sync, true);
      assert.equal(diagnostics.settings.close_request, true);
      assert.equal(JSON.stringify(diagnostics).includes("secret-access-key"), false);
      assert.equal(JSON.stringify(diagnostics).includes("base64-rubric"), false);
    }
  );
});

test("la firma rechaza coordenadas ausentes o invalidas en lugar de usar valores por defecto", async () => {
  const service = loadSignatureProviderService();

  assert.throws(
    () => service.__private.normalizeRequiredSignatureCoordinates(undefined),
    /colocar manualmente/i
  );
  assert.throws(
    () => service.__private.normalizeRequiredSignatureCoordinates("130 40 100 85"),
    /colocar manualmente/i
  );
  assert.throws(
    () => service.__private.normalizeRequiredSignaturePage("0"),
    /pagina valida/i
  );
  assert.equal(
    service.__private.normalizeRequiredSignatureCoordinates(" 100 110 300 160 "),
    "100 110 300 160"
  );
  assert.equal(service.__private.normalizeRequiredSignaturePage("2"), "2");
});
