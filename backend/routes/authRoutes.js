const express = require("express");
const {
  register,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  login,
  getRecaptchaConfig
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", register);
router.get("/recaptcha-config", getRecaptchaConfig);
router.post("/login", login);
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerification);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = {
  authRouter: router
};
