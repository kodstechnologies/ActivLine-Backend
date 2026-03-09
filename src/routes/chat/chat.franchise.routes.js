import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import {
  createFranchiseChatRoom,
  getFranchiseChatRooms,
  getFranchiseRoomMessages,
  updateFranchiseRoomStatus,
  assignFranchiseAdminToRoom,
} from "../../controllers/chat/chat.franchise.controller.js";

const router = Router();

router.use(verifyJWT);
router.post("/rooms", allowRoles("FRANCHISE_ADMIN", "ADMIN", "SUPER_ADMIN"), createFranchiseChatRoom);
router.get("/rooms", allowRoles("FRANCHISE_ADMIN", "ADMIN", "SUPER_ADMIN"), getFranchiseChatRooms);
router.get(
  "/rooms/:roomId/messages",
  allowRoles("FRANCHISE_ADMIN", "ADMIN", "SUPER_ADMIN"),
  getFranchiseRoomMessages
);
router.patch(
  "/rooms/:roomId/status",
  allowRoles("FRANCHISE_ADMIN", "ADMIN", "SUPER_ADMIN"),
  updateFranchiseRoomStatus
);
router.patch(
  "/rooms/:roomId/assign-admin",
  allowRoles("FRANCHISE_ADMIN", "ADMIN", "SUPER_ADMIN"),
  assignFranchiseAdminToRoom
);

export default router;
