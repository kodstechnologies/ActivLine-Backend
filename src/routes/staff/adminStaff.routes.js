import { Router } from "express";
import {
  updateAdminStaff,
  deleteAdminStaff,
  getAllAdminStaff,
  getSingleAdminStaff,
  getAssignedStaffStats,
  getLatestAssignedRooms,
  getAssignedCustomers,
  getAssignedCustomerPaymentHistory,
  getAssignedCustomerById,
  updateAssignedCustomer,
  deleteAssignedCustomer,
} from "../../controllers/staff/adminStaff.manage.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { canManageAdminStaff } from "../../middlewares/auth.middleware.js";
import { allowRoles, allowRolesExceptCustomer } from "../../middlewares/role.middleware.js";

const router = Router();

router.get("/", verifyJWT, allowRolesExceptCustomer, getAllAdminStaff);

router.get(
  "/assignment-stats",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "ADMIN_STAFF"),
  getAssignedStaffStats
);

router.get(
  "/latest-assigned-rooms",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "ADMIN_STAFF"),
  getLatestAssignedRooms
);

router.get(
  "/assigned-customers",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "ADMIN_STAFF"),
  getAssignedCustomers
);

router.get(
  "/assigned-payment-history",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "ADMIN_STAFF"),
  getAssignedCustomerPaymentHistory
);

router.get(
  "/assigned-customers/:customerId",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "ADMIN_STAFF"),
  getAssignedCustomerById
);

router.put(
  "/assigned-customers/:customerId",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "ADMIN_STAFF"),
  updateAssignedCustomer
);

router.delete(
  "/assigned-customers/:customerId",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "ADMIN_STAFF"),
  deleteAssignedCustomer
);

router.get("/:id", verifyJWT, allowRolesExceptCustomer, getSingleAdminStaff);

router.put("/:id", verifyJWT, canManageAdminStaff, updateAdminStaff);

router.delete("/:id", verifyJWT, canManageAdminStaff, deleteAdminStaff);

export default router;
