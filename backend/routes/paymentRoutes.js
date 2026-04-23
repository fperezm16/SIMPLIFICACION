const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");

// Middleware para interpretar JSON y formularios
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// Crear pago (venta)
router.post("/create", paymentController.createPayment);

// Anular pago (uso administrativo)
router.post("/:id/cancel", paymentController.cancelPayment);

// Ejecuta reversa automática de un pago
router.post("/:id/reverse", paymentController.reversePayment);

// Obtener voucher de pago
router.get("/:id/voucher", paymentController.getVoucher);

module.exports = router;