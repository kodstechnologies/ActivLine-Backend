import { Router } from "express";
import {
  getMyProfile,
  updateMyProfile,
} from "../../controllers/auth/profile.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { saveAdminFcmToken } from "../../controllers/auth/fcm.controller.js";

const router = Router();

router.get("/profile", verifyJWT, getMyProfile);
router.put("/edit", verifyJWT, updateMyProfile);
router.post("/fcm-token", verifyJWT, saveAdminFcmToken);

export default router;
