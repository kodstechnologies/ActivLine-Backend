import { Router } from "express";
import { 
  fetchUserFullDetails, 
  getProfile 
} from "../../controllers/Customer/customerprofile.controller.js";
import {
  editUserProfile,
  verifyOtpAndUpdate,
} from "../../controllers/Customer/profile.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";

const router = Router();

/**
 * GET /api/customer/profile/
 */
router.get("/", verifyJWT, allowRoles("CUSTOMER"), getProfile);

/**
 * GET /api/customer/profile/user/:user_id
 */
router.get("/user/:user_id", fetchUserFullDetails);

/**
 * POST /api/customer/profile/edit
 */
router.post("/edit", verifyJWT, allowRoles("CUSTOMER"), editUserProfile);

/**
 * POST /api/customer/profile/verify-update
 */
router.post("/verify-update", verifyJWT, allowRoles("CUSTOMER"), verifyOtpAndUpdate);

export default router;
