import { Router } from "express";
import { renew } from "../controllers/Customer/renew.controller.js";
import { upload } from "../utils/multerConfig.js";

const router = Router();

router.post("/renew", upload.none(), renew);

export default router;
