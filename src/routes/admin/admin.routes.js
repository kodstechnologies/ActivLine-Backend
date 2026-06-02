import { Router } from "express";
import {
  getAllStaff,
  getAdminStaff,
  getGlobalReferrals,
} from "../../controllers/Admin/admin.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import {
  createOrUpdateTariff,
  getTariffByFranchiseId,
} from "../../controllers/Admin/settings/franchiseTariff.controller.js";

const router = Router();

router.get("/dashboard", (req, res) => {
  res.json({
    success: true,
    message: "Admin dashboard access granted",
    admin: req.user,
  });
});

router.get("/staff", verifyJWT, allowRoles("ADMIN"), getAllStaff);
router.get("/staff", verifyJWT, getAdminStaff);

// Tariff configurations
router.post("/tariff", verifyJWT, allowRoles("ADMIN"), createOrUpdateTariff);

router.get("/tariff/:franchiseId", getTariffByFranchiseId);

router.get("/referrals", verifyJWT, allowRoles("ADMIN"), getGlobalReferrals);

export default router;
