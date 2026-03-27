import { Router } from "express";
import {
  forgotPassword,
  resetPassword,
  resendForgotPasswordOtp,
} from "../../controllers/auth/forgot.controller.js";
const router = Router();

router.post("/forgot-password", forgotPassword);
router.post("/forgot-password/resend", resendForgotPasswordOtp);
router.post("/reset-password", resetPassword);

export default router;
