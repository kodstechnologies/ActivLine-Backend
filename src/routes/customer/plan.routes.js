import express from "express";
import { getAllProfilesWithDetails } from "../../controllers/Customer/plan.controller.js";
import {
  createPlanOrder,
  verifyPlanPayment,
  getPlanPaymentHistoryByGroup,
  getSinglePlanPaymentDetails,
} from "../../controllers/payment/razorpay.controller.js";

const router = express.Router();

router.get("/full-details", getAllProfilesWithDetails);
router.post("/plans/:profileId/create-order", createPlanOrder);
router.post("/plans/verify-payment", verifyPlanPayment);

// Payment history APIs
router.get("/plans/group/:groupId/payment-history", getPlanPaymentHistoryByGroup);
router.get("/plans/payment-history", getPlanPaymentHistoryByGroup);
router.get("/plans/payment-history/:paymentId", getSinglePlanPaymentDetails);

export default router;
