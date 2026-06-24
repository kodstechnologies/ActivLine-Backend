import { Router } from "express";
import {
  register,
  login,
  checkUserExists,
} from "../../controllers/user/user.controller.js";

import {
  forgotPassword,
  verifyOTP,
  resetPassword,
} from "../../controllers/user/password.controller.js";
import { verifyResetJWT } from "../../middlewares/resetAuth.middleware.js";
const router = Router();

// 🔓 PUBLIC AUTH
router.post("/register", register);
router.post("/login", login);
router.get("/check-exists", checkUserExists);

// 🔓 ACCOUNT RECOVERY (NO JWT)
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOTP);
// 🔐 RESET PASSWORD (JWT VERIFIED)
router.post("/reset-password", verifyResetJWT, resetPassword);

export default router;
