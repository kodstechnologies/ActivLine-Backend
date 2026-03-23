import { Router } from "express";
import franchiseRoutes from "./franchise.routes.js";
import adminCredentialRoutes from "./franchiseAdmin.routes.js";
import franchiseNotificationRoutes from "./notification.routes.js";
const router = Router();

// 🔹 ADD THIS
router.use("/admin-credentials", adminCredentialRoutes);
router.use("/", franchiseNotificationRoutes);
router.use("/", franchiseRoutes);

export default router;
