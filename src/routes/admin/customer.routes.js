import { Router } from "express";
import {
  getPaymentHistoryByCustomerId,
  getPaymentHistoryByCustomerUserName,
} from "../../controllers/payment/razorpay.controller.js";
import { getCustomerTickets } from "../../controllers/Admin/customer.ticket.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";

const router = Router();

router.get(
  "/customers/:customerId/payment-history",
  verifyJWT,
  allowRoles("ADMIN", "FRANCHISE_ADMIN", "ADMIN_STAFF"),
  getPaymentHistoryByCustomerId
);

router.post(
  "/customers/payment-history/by-username",
  verifyJWT,
  allowRoles("ADMIN", "FRANCHISE_ADMIN", "ADMIN_STAFF"),
  getPaymentHistoryByCustomerUserName
);

router.get(
  "/customers/:customerId/tickets",
  verifyJWT,
  allowRoles("ADMIN"),
  getCustomerTickets
);

export default router;
