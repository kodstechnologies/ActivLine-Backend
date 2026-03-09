// src/routes/chat/chat.index.js
import { Router } from "express";
import adminRoutes from "./chat.admin.routes.js";
import userRoutes from "./chat.user.routes.js";
import staffRoutes from "./chat.staff.routes.js";
import franchiseRoutes from "./chat.franchise.routes.js";
import uploadRoutes from "./chat.upload.routes.js";
import summaryRoutes from "./chat.summary.routes.js";

const router = Router();

router.use("/admin", adminRoutes);
router.use("/user", userRoutes);
router.use("/staff", staffRoutes);
router.use("/franchise", franchiseRoutes);
router.use("/", uploadRoutes);
router.use("/", summaryRoutes);
export default router;
