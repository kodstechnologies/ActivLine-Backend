import { Router } from "express";
import franchiseRoutes from "./franchise.routes.js";
import adminCredentialRoutes from "./franchiseAdmin.routes.js";
const router = Router();

// 🔹 ADD THIS
router.use("/admin-credentials", adminCredentialRoutes);
router.use("/", franchiseRoutes);

export default router;
