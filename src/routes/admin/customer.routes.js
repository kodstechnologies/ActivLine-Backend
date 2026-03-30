import { Router } from "express";
import { getPaymentHistoryByCustomerId } from "../../controllers/payment/razorpay.controller.js";
import { getCustomerTickets } from "../../controllers/Admin/customer.ticket.controller.js";

const router = Router();

router.get("/customers/:customerId/payment-history", getPaymentHistoryByCustomerId);
router.get("/customers/:customerId/tickets", getCustomerTickets);

export default router;
