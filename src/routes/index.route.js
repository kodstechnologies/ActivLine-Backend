import { Router } from "express";
import authRoutes from "./auth/index.js";
import franchiseRoutes from "./franchise/index.js";
import userRoutes from "./user/index.route.js";
import chatRoutes from "./chat/chat.index.js";
import adminIndex from "./admin/index.js";
import customerIndex from "./customer/index.js";
import staffIndex from "./staff/index.js";
import notificationRoutes from "./Notification/notification.routes.js";
import dashboardRoutes from "./admin/Dashboard/dashboard.routes.js"; 
import locationRoutes from "./customer/location.routes.js";
import paymentRoutes from "./payment/index.js";

import logsIndex from "./ActivityLog/index.js";// ✅ ADD THIS
// import staffNotificationRoutes from "./Notification/staffnotification.routes.js";
const router = Router();

router.use("/auth", authRoutes);   // 🔐 LOGIN HERE
router.use("/franchise", franchiseRoutes);
router.use("/users", userRoutes);
router.use("/chat", chatRoutes);
router.use("/admin", adminIndex);
router.use("/customer", customerIndex);
router.use("/staff", staffIndex); 
router.use("/dashboard", dashboardRoutes);
router.use("/location", locationRoutes);
router.use("/payment", paymentRoutes);
router.use("/notifications", notificationRoutes); 
// router.use("/", staffNotificationRoutes);
router.use("/logs", logsIndex); 
// future:
// router.use("/staff", staffRoutes);

export default router;
