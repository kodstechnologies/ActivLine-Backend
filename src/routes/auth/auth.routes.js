
import { Router } from "express";
import { login } from "../../controllers/auth/login.controller.js";
import { logout } from "../../controllers/auth/logout.controller.js";
import { refresh } from "../../controllers/auth/refresh.controller.js";
import { createUser } from "../../controllers/auth/auth.controller.js";
import { createAdminStaff } from "../../controllers/auth/adminStaff/adminStaff.controller.js";
import { verifyJWT, adminAuth } from "../../middlewares/auth.middleware.js";
const router = Router();

router.post("/login", login);
router.post("/refresh", refresh);
router.post("/create", createUser);
router.post(
  "/create-adminStaff",
  verifyJWT,
  adminAuth,
  createAdminStaff
);

router.post("/logout", verifyJWT, logout);
export default router;
