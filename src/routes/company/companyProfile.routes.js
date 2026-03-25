import { Router } from "express";
import {
  createCompanyProfile,
  deleteCompanyProfile,
  getCompanyProfile,
  updateCompanyProfile,
} from "../../controllers/company/companyProfile.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { ROLES } from "../../constants/roles.js";

const router = Router();

router.get(
  "/me",
  verifyJWT,
  allowRoles(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.ADMIN_STAFF,
    ROLES.FRANCHISE_ADMIN,
    ROLES.STAFF
  ),
  getCompanyProfile
);

router.post(
  "/me",
  verifyJWT,
  allowRoles(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.ADMIN_STAFF,
    ROLES.FRANCHISE_ADMIN,
    ROLES.STAFF
  ),
  createCompanyProfile
);

router.put(
  "/me",
  verifyJWT,
  allowRoles(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.ADMIN_STAFF,
    ROLES.FRANCHISE_ADMIN,
    ROLES.STAFF
  ),
  updateCompanyProfile
);

router.delete(
  "/me",
  verifyJWT,
  allowRoles(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.ADMIN_STAFF,
    ROLES.FRANCHISE_ADMIN,
    ROLES.STAFF
  ),
  deleteCompanyProfile
);

export default router;
