import { Router } from "express";
import {
  createFranchiseAdmin,
  getFranchiseAdmins,
  updateFranchiseAdmin,
  deleteFranchiseAdmin
} from "../../controllers/franchise/adminCredential.controller.js";

import multer from "multer";

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/create",
  upload.single("profileImage"),
  createFranchiseAdmin
);
router.get("/", getFranchiseAdmins);
router.put("/:id", upload.single("profileImage"), updateFranchiseAdmin);
router.delete("/:id", deleteFranchiseAdmin);

export default router;