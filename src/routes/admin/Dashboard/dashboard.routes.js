import { Router } from "express";
import {
  getOpenTickets,
  getInProgressTickets,
  getTodayResolvedTickets,
  getTotalCustomers,
  getRecentTickets,
  getRecentPayments,
  getAssignedRoomsCount,
  getReportSummary,
} from "../../../controllers/Admin/Dashboard/dashboard.controller.js";
import { verifyJWT } from "../../../middlewares/auth.middleware.js";
import { allowRoles } from "../../../middlewares/role.middleware.js";

const router = Router();

router.use(verifyJWT, allowRoles("ADMIN", "ADMIN_STAFF", "FRANCHISE_ADMIN"));

router.get("/open-tickets", getOpenTickets);
router.get("/in-progress-tickets", getInProgressTickets);
router.get("/today-resolved", getTodayResolvedTickets);
router.get("/total-customers", getTotalCustomers);
router.get("/recent-tickets", getRecentTickets);
router.get("/recent-payments", getRecentPayments);
router.get("/assigned-rooms", getAssignedRoomsCount);
router.get("/report-summary", getReportSummary);
export default router;
