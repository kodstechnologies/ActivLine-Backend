import { Router } from "express";
import {
  createCannedResponse,
  getAllCannedResponses,
  updateCannedResponse,
  deleteCannedResponse,
} from "../../../controllers/Admin/settings/cannedResponse.controller.js";

import { verifyJWT } from "../../../middlewares/auth.middleware.js";
import { allowRoles } from "../../../middlewares/role.middleware.js";
import { ROLES } from "../../../constants/roles.js";

const router = Router();

/**
 * 📖 GET → Admin + Super Admin
 * (Used for viewing & staff usage)
 */


router.get(
  "/responses",
  verifyJWT,
  allowRoles(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.ADMIN_STAFF
  ),
  getAllCannedResponses
);

router.get(
  "/responses/:categoryId",
  verifyJWT,
  allowRoles(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.ADMIN_STAFF
  ),
  getAllCannedResponses
);




/**
 * 🔐 WRITE → Super Admin only
 */
router.post(
  "/responses",
  verifyJWT,
  allowRoles(ROLES.SUPER_ADMIN),
  createCannedResponse
);
router.put(
  "/responses/:id",
  verifyJWT,
  allowRoles(ROLES.SUPER_ADMIN),
  updateCannedResponse
);

router.delete(
  "/responses/:id",
  verifyJWT,
  allowRoles(ROLES.SUPER_ADMIN),
  deleteCannedResponse
);

export default router;


