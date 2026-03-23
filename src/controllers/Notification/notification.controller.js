import { asyncHandler } from "../../utils/AsyncHandler.js";
import { ApiResponse } from "../../utils/ApiReponse.js";
import ApiError from "../../utils/ApiError.js";
import Notification from "../../models/Notification/notification.model.js";
import { getNotificationsForRole } from "../../services/Notification/notification.service.js";

/**
 * GET notifications for logged-in user role
 */
export const getNotifications = asyncHandler(async (req, res) => {
  const { _id, role } = req.user;

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit, 10) || 20, 1),
    100
  );
  const skip = (page - 1) * limit;

  const filter = {
    recipientRole: role,
    recipientUser: _id,
  };

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(filter),
  ]);

  res.status(200).json(
    ApiResponse.success(
      notifications,
      "Notifications fetched successfully",
      {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      }
    )
  );
});


/**
 * MARK single notification as read
 */
export const markNotificationAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await Notification.findById(id);

  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }

  notification.isRead = true;
  await notification.save();

  res.status(200).json(
    ApiResponse.success(notification, "Notification marked as read")
  );
});

/**
 * DELETE single notification
 */
export const deleteSingleNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await Notification.findById(id);

  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }

  await notification.deleteOne();

  res.status(200).json(
    ApiResponse.success(null, "Notification deleted successfully")
  );
});

/**
 * DELETE all notifications for user role
 */
export const deleteAllNotifications = asyncHandler(async (req, res) => {
  const role = req.user.role;

  await Notification.deleteMany({
    roles: { $in: [role] },
  });

  res.status(200).json(
    ApiResponse.success(null, "All notifications deleted successfully")
  );
});

/**
 * 🔔 GET ADMIN UNREAD COUNT
 */
/**
 * 🔔 GET UNREAD COUNT (ADMIN / STAFF)
 * GET /api/notifications/unread-count
 */
export const getUnreadNotificationCount = async (req, res) => {
  const count = await Notification.countDocuments({
    recipientUser: req.user._id,
    isRead: false,
  });

  res.json({
    success: true,
    data: {
      unreadCount: count,
    },
  });
};
