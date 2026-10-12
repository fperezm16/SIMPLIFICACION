const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { requireAuth, requireRole } = require("../src/auth");

// Middleware para interpretar JSON y formularios
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// Verifica si la configuracion de NeoNet esta completa
router.get("/health", paymentController.getPaymentHealth);
router.get("/3ds/return", paymentController.renderThreeDSReturnPage);
router.post("/3ds/return", paymentController.renderThreeDSReturnPage);

// Crear pago (venta)
router.post("/create", paymentController.createPayment);
router.post("/:id/continue", paymentController.continuePayment);

router.get(
  "/reversals",
  requireAuth,
  requireRole("admin", "operador_pagos"),
  paymentController.listReversalPayments
);

router.get(
  "/:id/reversal-history",
  requireAuth,
  requireRole("admin", "operador_pagos"),
  paymentController.getReversalHistory
);

// Anular pago (uso administrativo)
router.post(
  "/:id/cancel",
  requireAuth,
  requireRole("admin", "operador_pagos"),
  paymentController.cancelPayment
);

router.get(
  "/:id/cancellation-receipt",
  requireAuth,
  requireRole("admin", "operador_pagos"),
  paymentController.getCancellationReceipt
);

router.get(
  "/:id/cancellation-receipt/pdf",
  requireAuth,
  requireRole("admin", "operador_pagos"),
  paymentController.downloadCancellationReceiptPdf
);

router.post(
  "/:id/cancellation-receipt/review",
  requireAuth,
  requireRole("admin", "operador_pagos"),
  paymentController.reviewCancellationReceipt
);

router.post(
  "/:id/cancellation-receipt/send",
  requireAuth,
  requireRole("admin", "operador_pagos"),
  paymentController.sendCancellationReceipt
);

// Obtener voucher de pago
router.get("/:id/voucher", paymentController.getVoucher);
router.get("/:id/voucher/pdf", paymentController.downloadVoucherPdf);

module.exports = router;
