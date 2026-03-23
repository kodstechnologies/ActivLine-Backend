import { Router } from "express";
// import publicRoutes from "./public.routes.js";
import adminRoutes from "./admin.routes.js";
// import adminAuthRoutes from "./auth.routes.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import adminTicketRoutes from "./Ticket/adminTicket.routes.js";
import dashboardIndex from "./Dashboard/index.js";
import settingsIndex from "./settings/index.js";
import adminCustomerRoutes from "./customer.routes.js";
const router = Router();

/* ===== PUBLIC (NO JWT) ===== */
// router.use("/", publicRoutes);        // /create
// router.use("/auth", adminAuthRoutes); // /login

/* ===== PROTECTED ===== */
router.use("/settings", settingsIndex); 
router.use(verifyJWT);

// Dashboard routes have their own role checks defined in dashboard.routes.js
router.use("/dashboard", dashboardIndex);

router.use(allowRoles("ADMIN", "SUPER_ADMIN"));
// Protect other admin routes
router.use("/", adminTicketRoutes);
router.use("/", adminCustomerRoutes);
router.use("/", adminRoutes);         // /dashboard

export default router;
