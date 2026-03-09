import { Router } from "express";
import {
  createFranchiseAdmin,
  getFranchiseAdmins,
  updateFranchiseAdmin,
  deleteFranchiseAdmin
} from "../../controllers/franchise/adminCredential.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";

import multer from "multer";

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/create",
  upload.single("profileImage"),
  createFranchiseAdmin
);
router.get(
  "/",
  verifyJWT,
  allowRoles("FRANCHISE_ADMIN", "ADMIN", "SUPER_ADMIN"),
  getFranchiseAdmins
);
router.put("/:id", upload.single("profileImage"), updateFranchiseAdmin);
router.delete("/:id", deleteFranchiseAdmin);

export default router;
