import { Router } from "express";
import {
  customerLogin,
  customerLogout,
  refreshAccessToken,
  customerSendLoginOtp,
  customerVerifyLoginOtp,
} from "../../controllers/Customer/customerlogin.controller.js";
import { verifyCustomerJWT } from "../../middlewares/auth.middleware.js";
import { upload } from "../../middlewares/multer.middleware.js";

const router = Router();

/**
 * POST /api/customer/login
 */
router.post("/login", upload.none(), customerLogin);

/**
 * POST /api/customer/login/send-otp
 */
router.post("/login/send-otp", upload.none(), customerSendLoginOtp);

/**
 * POST /api/customer/login/verify-otp
 */
router.post("/login/verify-otp", upload.none(), customerVerifyLoginOtp);

/**
 * POST /api/customer/refresh
 */
router.post("/refresh", upload.none(), refreshAccessToken);

/**
 * POST /api/customer/logout
 */
router.post(
  "/logout",
  verifyCustomerJWT, // ⬅️ STRICT
  upload.none(),
  customerLogout
);

export default router;
