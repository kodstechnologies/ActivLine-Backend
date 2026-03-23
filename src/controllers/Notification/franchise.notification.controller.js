import Notification from "../../models/Notification/notification.model.js";
import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";

/**
 * GET my franchise notifications
 */
export const getMyFranchiseNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit, 10) || 20, 1),
    100
  );
  const skip = (page - 1) * limit;

  const filter = {
    recipientUser: req.user._id,
    recipientRole: "FRANCHISE_ADMIN",
  };

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
 * MARK one as read
 */
export const markFranchiseNotificationRead = asyncHandler(async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, recipientUser: req.user._id },
    { isRead: true }
  );

  res.json(ApiResponse.success(null, "Notification marked as read"));
});

/**
 * MARK all as read
 */
export const markAllFranchiseNotificationsRead = asyncHandler(
  async (req, res) => {
    await Notification.updateMany(
      {
        recipientUser: req.user._id,
        recipientRole: "FRANCHISE_ADMIN",
        isRead: false,
      },
      { isRead: true }
    );

    res.json(ApiResponse.success(null, "All notifications marked as read"));
  }
);

/**
 * DELETE one
 */
export const deleteFranchiseNotification = asyncHandler(async (req, res) => {
  await Notification.findOneAndDelete({
    _id: req.params.id,
    recipientUser: req.user._id,
  });

  res.json(ApiResponse.success(null, "Notification deleted"));
});

/**
 * DELETE all
 */
export const deleteAllFranchiseNotifications = asyncHandler(async (req, res) => {
  await Notification.deleteMany({
    recipientUser: req.user._id,
    recipientRole: "FRANCHISE_ADMIN",
  });

  res.json(ApiResponse.success(null, "All notifications deleted"));
});

/**
 * GET unread count
 */
export const getFranchiseUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({
    recipientUser: req.user._id,
    recipientRole: "FRANCHISE_ADMIN",
    isRead: false,
  });

  res.json(ApiResponse.success({ unreadCount }));
});
