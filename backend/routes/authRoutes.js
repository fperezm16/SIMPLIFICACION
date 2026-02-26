const express = require("express");
const {
  register,
  verifyEmail,
  resendVerification,
  login
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerification);

module.exports = {
  authRouter: router
};
