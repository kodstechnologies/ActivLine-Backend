import { Router } from "express";
import {
  getPartnerBalance,
  getGlobalOttTransactions,
} from "../../controllers/Admin/ottAdmin.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";

const router = Router();

// Retrieve PlayBoxTV Partner Balance
router.get("/balance", verifyJWT, allowRoles("ADMIN", "SUPER_ADMIN"), getPartnerBalance);

// Retrieve all OTT assignments
router.get("/transactions", verifyJWT, allowRoles("ADMIN", "SUPER_ADMIN"), getGlobalOttTransactions);

export default router;
