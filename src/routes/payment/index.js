import { Router } from "express";
import {
  createOrder,
  verifyPayment,
  createPlanOrder,
  createPlanOrderFromBody,
  verifyPlanPayment,
  getPlanPaymentHistoryByGroup,
  getAllPlanPaymentHistory,
  getSinglePlanPaymentDetails,
} from "../../controllers/payment/razorpay.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";

const router = Router();

router.post("/create-order", createOrder);
router.post("/verify-payment", verifyPayment);
router.post("/plan/create-order", createPlanOrderFromBody);
router.post("/plan/:profileId/create-order", createPlanOrder);
router.post("/plan/verify-payment", verifyPlanPayment);
router.get(
  "/history/all",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "ADMIN_STAFF"),
  getAllPlanPaymentHistory
);
router.get(
  "/history/all-customers",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "ADMIN_STAFF"),
  getAllPlanPaymentHistory
);
router.get("/franchise/account/:accountId/history", getPlanPaymentHistoryByGroup);
router.get("/franchise/:groupId/history", getPlanPaymentHistoryByGroup);
router.get("/history/:paymentId", getSinglePlanPaymentDetails);

export default router;
