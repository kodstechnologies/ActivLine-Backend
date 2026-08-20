import { Router } from "express";
import {
  getGeneralSettings,
  updateGeneralSettings,
  getAllBanners,
  createBanner,
  updateBanner,
  toggleBanner,
  deleteBanner,
  createReferalMessage,
  getReferalMessage,
} from "../../../controllers/Admin/settings/generalSettings.controller.js";

import { verifyJWT } from "../../../middlewares/auth.middleware.js";
import { allowRoles } from "../../../middlewares/role.middleware.js";
import { ROLES } from "../../../constants/roles.js";
import { bannerUpload } from "../../../middlewares/multer.middleware.js";

const router = Router();

// ── General Settings ──────────────────────────────────────────────────────────

/**
 * 📖 GET → Super Admin + Admin + Staff + Customer
 */
router.get(
  "/general",
  verifyJWT,
  allowRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ADMIN_STAFF, ROLES.CUSTOMER),
  getGeneralSettings,
);

/**
 * ✏️ PUT → Super Admin only
 */
router.put(
  "/general",
  verifyJWT,
  allowRoles(ROLES.SUPER_ADMIN),
  updateGeneralSettings,
);

// ── Banner Routes ─────────────────────────────────────────────────────────────

/**
 * 📖 GET /banner — fetch all banners (all authenticated roles)
 */
router.get(
  "/banner",
  verifyJWT,
  allowRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ADMIN_STAFF, ROLES.CUSTOMER),
  getAllBanners,
);

/**
 * ➕ POST /banner/create — upload a new image or video banner
 * Field name: "file"  |  Allowed: image/*, video/*  |  Limit: 100 MB
 */
router.post(
  "/banner/create",
  verifyJWT,
  allowRoles(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.ADMIN_STAFF,
    ROLES.ADMIN_STAFF,
    ROLES.FRANCHISE_ADMIN,
  ),
  bannerUpload.single("file"),
  createBanner,
);

/**
 * ✏️ PUT /banner/:bannerId — replace an existing banner's file
 * Field name: "file"  |  Allowed: image/*, video/*  |  Limit: 100 MB
 */
router.put(
  "/banner/:bannerId",
  verifyJWT,
  allowRoles(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.ADMIN_STAFF,
    ROLES.ADMIN_STAFF,
    ROLES.FRANCHISE_ADMIN,
  ),
  bannerUpload.single("file"),
  updateBanner,
);

/**
 * 🔁 PATCH /banner/:bannerId/toggle — activate / deactivate a banner
 */

router.patch(
  "/banner/:bannerId/toggle",
  verifyJWT,
  allowRoles(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.ADMIN_STAFF,
    ROLES.ADMIN_STAFF,
    ROLES.FRANCHISE_ADMIN,
  ),
  toggleBanner,
);

/**
 * 🗑 DELETE /banner/:bannerId — permanently remove a banner + Cloudinary file
 */
router.delete(
  "/banner/:bannerId",
  verifyJWT,
  allowRoles(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.ADMIN_STAFF,
    ROLES.ADMIN_STAFF,
    ROLES.FRANCHISE_ADMIN,
  ),
  deleteBanner,
);

// referal message
router.get(
  "/referal-message",
  verifyJWT,
  allowRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ADMIN_STAFF, ROLES.CUSTOMER),
  getReferalMessage,
);

router.post(
  "/referal-message",
  verifyJWT,
  allowRoles(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.ADMIN_STAFF,
    ROLES.ADMIN_STAFF,
    ROLES.FRANCHISE_ADMIN,
  ),
  createReferalMessage,
);
export default router;
