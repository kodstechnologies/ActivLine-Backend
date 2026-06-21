import { Router } from "express";
import {
  fetchFranchiseAccounts,
  getFranchiseAvailability,
  updateFranchiseAvailability,
} from "../../controllers/franchise/franchise.controller.js";
import { fetchAllAdmins } from "../../controllers/franchise/f.admin.controller.js";
import { fetchSubPlans } from "../../controllers/franchise/subPlan.controller.js";
import { fetchGroupDetails } from "../../controllers/franchise/groupDetails.controller.js";
import { upload } from "../../utils/multerConfig.js";
import { getProfiles } from "../../controllers/franchise/profile.controller.js";
import { getProfileDetails } from "../../controllers/franchise/profileDetails.controller.js";
import { getFranchiseAdmins } from "../../controllers/franchise/admin.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { getReportSummary } from "../../controllers/Admin/Dashboard/dashboard.controller.js";
import { getFranchiseCustomerCount } from "../../controllers/franchise/customerCount.controller.js";
import {
  createOrUpdateTariff,
  getTariffByFranchiseId,
} from "../../controllers/Admin/settings/franchiseTariff.controller.js";

const router = Router();

router.post("/admins", upload.none(), fetchAllAdmins);

router.get("/group-details", fetchGroupDetails);
router.get("/sub-plans/:groupId", fetchSubPlans);
router.get(
  "/report-summary",
  verifyJWT,
  allowRoles("ADMIN", "ADMIN_STAFF", "FRANCHISE_ADMIN"),
  getReportSummary,
);

router.get("/", fetchFranchiseAccounts);
router.get("/:accountId", fetchFranchiseAccounts);
router.get(
  "/:accountId/customers/count",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN"),
  getFranchiseCustomerCount,
);
router.get("/:accountId/profiles", getProfiles);
router.get("/:accountId/profiles/:profileId", getProfiles);
router.get("/:accountId/profile-details/:profileId", getProfileDetails);
router.get("/:accountId/admins", getFranchiseAdmins);

router.get("/:accountId/availability", verifyJWT, getFranchiseAvailability);

router.put(
  "/:accountId/availability",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN"),
  updateFranchiseAvailability,
);

// Tariff configurations
router.post(
  "/tariff",
  verifyJWT,
  // allowRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.FRANCHISE_ADMIN),
  createOrUpdateTariff,
);

router.get("/tariff/:franchiseId", getTariffByFranchiseId);

export default router;
