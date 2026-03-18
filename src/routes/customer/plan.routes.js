import express from "express";
import { getAllProfilesWithDetails } from "../../controllers/Customer/plan.controller.js";
import {
  getCustomerPlanSummary,
  getCustomerPlanSummaryById,
} from "../../controllers/Customer/customerPlanSummary.controller.js";
import { getCustomerProfiles } from "../../controllers/Customer/customerProfiles.controller.js";
import {
  createPlanOrder,
  verifyPlanPayment,
  getPlanPaymentHistoryByGroup,
  getSinglePlanPaymentDetails,
  getMyPlanPaymentHistory,
  getMySinglePlanPaymentDetails,
  getMyLatestPlanPaymentHistory,
  downloadMyPaymentInvoice,
} from "../../controllers/payment/razorpay.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";

const router = express.Router();

router.get("/full-details", getAllProfilesWithDetails);
router.get(
  "/plans/summary",
  verifyJWT,
  allowRoles("CUSTOMER"),
  getCustomerPlanSummary
);
router.get(
  "/:customerId/plans/summary",
  verifyJWT,
  allowRoles("CUSTOMER"),
  getCustomerPlanSummaryById
);
router.get(
  "/:customerId/profiles",
  verifyJWT,
  allowRoles("CUSTOMER"),
  getCustomerProfiles
);
router.post(
  "/plans/:profileId/create-order",
  verifyJWT,
  allowRoles("CUSTOMER"),
  createPlanOrder
);
router.post("/plans/verify-payment", verifyPlanPayment);

// Payment history APIs
router.get("/plans/group/:groupId/payment-history", getPlanPaymentHistoryByGroup);
router.get("/plans/payment-history", getPlanPaymentHistoryByGroup);
router.get("/plans/payment-history/:paymentId", getSinglePlanPaymentDetails);

// Customer own payment history APIs
router.get(
  "/plans/my/payment-history",
  verifyJWT,
  allowRoles("CUSTOMER"),
  getMyPlanPaymentHistory
);
router.get(
  "/plans/my/payment-history/latest",
  verifyJWT,
  allowRoles("CUSTOMER"),
  getMyLatestPlanPaymentHistory
);
router.get(
  "/plans/my/payment-history/:paymentId",
  verifyJWT,
  allowRoles("CUSTOMER"),
  getMySinglePlanPaymentDetails
);
router.get(
  "/plans/my/payment-history/:paymentId/invoice",
  verifyJWT,
  allowRoles("CUSTOMER"),
  downloadMyPaymentInvoice
);

export default router;
