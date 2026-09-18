const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const {
  formatVoucherDate,
  formatVoucherAmount
} = require("./paymentHelpersService");

function resolveVoucherLogoPaths() {
  const base = path.resolve(__dirname, "../../frontend/src/assets");
  return {
    header: path.join(base, "dgac-header.png"),
    seal: path.join(base, "dgac-oficial.png")
  };
}

function drawVoucherLogos(doc) {
  const logos = resolveVoucherLogoPaths();

  if (fs.existsSync(logos.header)) {
    doc.image(logos.header, 42, 34, { fit: [180, 46], align: "left" });
  }

  if (fs.existsSync(logos.seal)) {
    doc.image(logos.seal, 470, 30, { fit: [72, 72], align: "right" });
  }
}

function drawVoucherHeaderBands(doc) {
  const bands = [
    {
      lineWidth: 14,
      strokeColor: "#1d8fe1",
      opacity: 0.18,
      points: [0, 93, 150, 69, 360, 107, 595, 85]
    },
    {
      lineWidth: 9,
      strokeColor: "#0f6fda",
      opacity: 0.46,
      points: [0, 101, 165, 79, 370, 117, 595, 95]
    },
    {
      lineWidth: 5,
      strokeColor: "#0b88ff",
      opacity: 0.62,
      points: [0, 109, 178, 87, 382, 125, 595, 103]
    }
  ];

  for (const band of bands) {
    const [startX, startY, cp1X, cp1Y, cp2X, cp2Y, endX, endY] = band.points;
    doc
      .save()
      .lineWidth(band.lineWidth)
      .strokeColor(band.strokeColor)
      .strokeOpacity(band.opacity)
      .moveTo(startX, startY)
      .bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY)
      .stroke()
      .restore();
  }
}

function buildVoucherData(payment) {
  return {
    payment_method: "NeoNet",
    transaction_date: payment.created_at,
    amount: payment.amount,
    reference_number: payment.reference_number,
    authorization_code: payment.authorization_code,
    audit_number: payment.audit_number,
    masked_card: payment.masked_card,
    cardholder_name: payment.cardholder_name || null,
    card_brand: payment.card_brand || null,
    transaction_id: payment.transaction_id || null,
    status: payment.status
  };
}

function generateVoucherPdfBuffer(payment) {
  return new Promise((resolve, reject) => {
    const voucher = buildVoucherData(payment);
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const buffers = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    drawVoucherHeaderBands(doc);
    drawVoucherLogos(doc);

    doc
      .fillColor("#123b5d")
      .fontSize(20)
      .text("Comprobante de pago", 42, 126, { align: "left" });

    const rows = [
      ["Metodo de pago", voucher.payment_method],
      ["Fecha de transacción", formatVoucherDate(voucher.transaction_date)],
      ["ID de pago", `#${payment.id}`],
      ["Estado", String(voucher.status || "N/D").toUpperCase()],
      ["Referencia", voucher.reference_number || "N/D"],
      ["Autorización", voucher.authorization_code || "N/D"],
      ["Auditoría", voucher.audit_number || "N/D"],
      ["Tarjeta", voucher.masked_card || "N/D"],
      ["Marca", voucher.card_brand || "N/D"],
      ["Transacción", voucher.transaction_id || "N/D"]
    ];

    let y = 182;
    for (const [label, value] of rows) {
      doc
        .fillColor("#7a9198")
        .fontSize(9)
        .text(String(label), 48, y, { width: 170 });

      doc
        .fillColor("#173652")
        .fontSize(11)
        .text(String(value), 210, y, { width: 320, align: "right" });

      doc
        .strokeColor("#d7e6e8")
        .lineWidth(1)
        .moveTo(48, y + 18)
        .lineTo(546, y + 18)
        .stroke();

      y += 28;
    }

    doc
      .strokeColor("#b8d2db")
      .lineWidth(1)
      .moveTo(48, y + 8)
      .lineTo(546, y + 8)
      .stroke();

    doc
      .roundedRect(42, y + 18, 510, 34, 10)
      .fill("#eef6fd");

    doc
      .fillColor("#7a9198")
      .fontSize(10)
      .text("Monto total", 58, y + 30, { width: 170 });

    doc
      .fillColor("#103351")
      .fontSize(18)
      .text(formatVoucherAmount(voucher.amount), 228, y + 26, {
        width: 290,
        align: "right"
      });

    doc
      .fillColor("#5b7485")
      .fontSize(9)
      .text("Documento generado por el sistema institucional de pagos.", 48, y + 66);

    doc.end();
  });
}

module.exports = {
  resolveVoucherLogoPaths,
  drawVoucherLogos,
  drawVoucherHeaderBands,
  buildVoucherData,
  generateVoucherPdfBuffer
};
