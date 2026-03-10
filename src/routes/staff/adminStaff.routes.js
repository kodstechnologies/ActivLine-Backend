import { Router } from "express";
import {
  updateAdminStaff,
  deleteAdminStaff,
  getAllAdminStaff,
  getSingleAdminStaff,
} from "../../controllers/staff/adminStaff.manage.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { canManageAdminStaff } from "../../middlewares/auth.middleware.js";
import { allowRolesExceptCustomer } from "../../middlewares/role.middleware.js";

const router = Router();
router.get(
  "/",
  verifyJWT,
  allowRolesExceptCustomer,
  getAllAdminStaff
);

// 👤 GET SINGLE ADMIN STAFF
// GET /api/staff/admin-staff/:id
router.get(
  "/:id",
  verifyJWT,
  allowRolesExceptCustomer,
  getSingleAdminStaff
);
// ✏️ UPDATE ADMIN STAFF
// PUT /api/staff/admin-staff/:id
router.put(
  "/:id",
  verifyJWT,
  canManageAdminStaff,
  updateAdminStaff
);

// 🗑 DELETE ADMIN STAFF
// DELETE /api/staff/admin-staff/:id
router.delete(
  "/:id",
  verifyJWT,
  canManageAdminStaff,
  deleteAdminStaff
);

export default router;
