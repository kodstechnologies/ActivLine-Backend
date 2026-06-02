import { Router } from "express";
import {
  listAvailablePacks,
  activatePack,
  getMySubscriptions,
} from "../../controllers/Customer/ott.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";

const router = Router();

// Retrieve all available OTT packs in the catalog
router.get("/plans", verifyJWT, allowRoles("CUSTOMER"), listAvailablePacks);

// Retrieve customer's currently active OTT packs
router.get("/my-packs", verifyJWT, allowRoles("CUSTOMER"), getMySubscriptions);

// Activate/Purchase a new OTT pack
router.post("/activate", verifyJWT, allowRoles("CUSTOMER"), activatePack);

export default router;
