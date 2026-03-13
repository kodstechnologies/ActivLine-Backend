import { Router } from "express";
import {
  createOrder,
  verifyPayment,
  getPlanPaymentHistoryByGroup,
  getSinglePlanPaymentDetails,
} from "../../controllers/payment/razorpay.controller.js";

const router = Router();

router.post("/create-order", createOrder);
router.post("/verify-payment", verifyPayment);
router.get("/franchise/account/:accountId/history", getPlanPaymentHistoryByGroup);
router.get("/franchise/:groupId/history", getPlanPaymentHistoryByGroup);
router.get("/history/:paymentId", getSinglePlanPaymentDetails);

export default router;
