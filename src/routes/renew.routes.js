import { Router } from "express";
import { renew } from "../controllers/Customer/renew.controller.js";
import {
  getUserSessionDetails,
  getUserByPhoneDetails,
} from "../controllers/Customer/dashboard.controller.js";
import { upload } from "../utils/multerConfig.js";

const router = Router();

router.post("/renew", upload.none(), renew);
router.get("/get_usersession_details/:userId", getUserSessionDetails);
router.get("/get_user_by_phone/:phone", getUserByPhoneDetails);

export default router;
