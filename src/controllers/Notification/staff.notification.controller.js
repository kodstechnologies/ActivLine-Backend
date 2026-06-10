// src/controllers/staff/staff.notification.controller.js
import Notification from "../../models/Notification/notification.model.js";
import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";

/**
 * =========================
 * GET MY NOTIFICATIONS
 * =========================
 */
export const getMyStaffNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit, 10) || 20, 1),
    100
  );
  const skip = (page - 1) * limit;

  const filter = {
    recipientUser: req.user._id,
    recipientRole: "ADMIN_STAFF",
  };

  if (req.query.isRead !== undefined) {
    filter.isRead = String(req.query.isRead) === "true";
  }

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(filter),
  ]);

  res.json(
    ApiResponse.success(notifications, "Notifications fetched successfully", {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    })
  );
});

/**
 * =========================
 * MARK ONE AS READ
 * =========================
 */
export const markStaffNotificationRead = asyncHandler(async (req, res) => {
  await Notification.findOneAndUpdate(
    {
      _id: req.params.id,
      recipientUser: req.user._id,
    },
    { isRead: true }
  );

  res.json(ApiResponse.success(null, "Notification marked as read"));
});

/**
 * =========================
 * MARK ALL AS READ
 * =========================
 */
export const markAllStaffNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    {
      recipientUser: req.user._id,
      recipientRole: "ADMIN_STAFF",
      isRead: false,
    },
    { isRead: true }
  );

  res.json(ApiResponse.success(null, "All notifications marked as read"));
});

/**
 * =========================
 * DELETE ONE
 * =========================
 */
export const deleteStaffNotification = asyncHandler(async (req, res) => {
  await Notification.findOneAndDelete({
    _id: req.params.id,
    recipientUser: req.user._id,
  });

  res.json(ApiResponse.success(null, "Notification deleted"));
});

/**
 * =========================
 * DELETE ALL
 * =========================
 */
export const deleteAllStaffNotifications = asyncHandler(async (req, res) => {
  await Notification.deleteMany({
    recipientUser: req.user._id,
    recipientRole: "ADMIN_STAFF",
  });

  res.json(ApiResponse.success(null, "All notifications deleted"));
});
/**
 * =========================
 * GET UNREAD COUNT
 * =========================
 */
export const getStaffUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({
    recipientUser: req.user._id,
    recipientRole: "ADMIN_STAFF",
    isRead: false,
  });

  res.json(
    ApiResponse.success({ unreadCount })
  );
});
