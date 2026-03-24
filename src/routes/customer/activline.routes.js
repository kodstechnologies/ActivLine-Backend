// routes/activline.routes.js
import express from "express";
import {
  getFilteredUsers,
  getProfileDetails,
  getLogoffTimeOnlineStatus,
} from "../../controllers/Customer/activline.controller.js";
import { allowRoles, allowRolesExceptCustomer } from "../../middlewares/role.middleware.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get(
  "/activline/user/:page/:perPage",
  verifyJWT,
  allowRolesExceptCustomer,
  getFilteredUsers
);

router.get(
  "/activline/get_profile_details/:profileId",
  verifyJWT,
  allowRolesExceptCustomer,
  getProfileDetails
);

router.get(
  "/activline/logoff-status/:userId",
  verifyJWT,
  allowRoles(
    "CUSTOMER",
    "ADMIN",
    "SUPER_ADMIN",
    "ADMIN_STAFF",
    "FRANCHISE_ADMIN",
    "STAFF"
  ),
  getLogoffTimeOnlineStatus
);

export default router;
