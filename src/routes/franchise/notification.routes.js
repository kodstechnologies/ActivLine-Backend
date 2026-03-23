import { Router } from "express";
import { auth } from "../../middlewares/auth.middleware.js";
import {
  getMyFranchiseNotifications,
  markFranchiseNotificationRead,
  markAllFranchiseNotificationsRead,
  deleteFranchiseNotification,
  deleteAllFranchiseNotifications,
  getFranchiseUnreadCount,
} from "../../controllers/Notification/franchise.notification.controller.js";

const router = Router();

router.get(
  "/notifications",
  auth("FRANCHISE_ADMIN"),
  getMyFranchiseNotifications
);

router.put(
  "/notifications/:id/read",
  auth("FRANCHISE_ADMIN"),
  markFranchiseNotificationRead
);

router.put(
  "/notifications/read-all",
  auth("FRANCHISE_ADMIN"),
  markAllFranchiseNotificationsRead
);

router.delete(
  "/notifications/:id",
  auth("FRANCHISE_ADMIN"),
  deleteFranchiseNotification
);

router.delete(
  "/notifications",
  auth("FRANCHISE_ADMIN"),
  deleteAllFranchiseNotifications
);

router.get(
  "/notifications/unread-count",
  auth("FRANCHISE_ADMIN"),
  getFranchiseUnreadCount
);

export default router;
