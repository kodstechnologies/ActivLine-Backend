import Notification from "../../models/Notification/customernotification.model.js";
import ApiResponse from "../../utils/ApiReponse.js";
import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiError from "../../utils/ApiError.js";


// =====================================
// ✅ GET ALL MY NOTIFICATIONS
// =====================================
export const getMyNotifications = asyncHandler(async (req, res) => {
  const customerId = req.user._id;

  // 🔹 Page from query (default = 1)
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  // ✅ Configurable limit (max 100)
  const limit = Math.min(
    Math.max(parseInt(req.query.limit, 10) || 20, 1),
    100
  );
  const skip = (page - 1) * limit;

  // 🔹 Fetch data + total count
  const [notifications, total] = await Promise.all([
    Notification.find({ customerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    Notification.countDocuments({ customerId }),
  ]);

  res.json(
    ApiResponse.success(
      notifications,
      "Notifications fetched successfully",
      {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total, // ✅ Useful for infinite scroll
      }
    )
  );
});



// =====================================
// ✅ GET UNREAD COUNT (Badge)
// =====================================
export const getUnreadCount = asyncHandler(async (req, res) => {
  const customerId = req.user._id;

  const count = await Notification.countDocuments({
    customerId,
    isRead: false,
  });

  res.json(
    ApiResponse.success({ unreadCount: count })
  );
});


// =====================================
// ✅ MARK SINGLE AS READ
// =====================================
export const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const customerId = req.user._id;

  const result = await Notification.updateOne(
    { _id: id, customerId },
    { $set: { isRead: true } }
  );

  if (!result.matchedCount) {
    throw new ApiError(404, "Notification not found");
  }

  res.json(
    ApiResponse.success(null, "Notification marked as read")
  );
});


// =====================================
// ✅ MARK ALL AS READ
// =====================================
export const markAllAsRead = asyncHandler(async (req, res) => {
  const customerId = req.user._id;

  await Notification.updateMany(
    { customerId, isRead: false },
    { $set: { isRead: true } }
  );

  res.json(
    ApiResponse.success(null, "All notifications marked as read")
  );
});


// =====================================
// ✅ DELETE SINGLE NOTIFICATION
// =====================================
export const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const customerId = req.user._id;

  const result = await Notification.deleteOne({
    _id: id,
    customerId,
  });

  if (!result.deletedCount) {
    throw new ApiError(404, "Notification not found");
  }

  res.json(
    ApiResponse.success(null, "Notification deleted successfully")
  );
});


// =====================================
// ✅ DELETE ALL NOTIFICATIONS
// =====================================
export const deleteAllNotifications = asyncHandler(async (req, res) => {
  const customerId = req.user._id;

  await Notification.deleteMany({ customerId });

  res.json(
    ApiResponse.success(null, "All notifications deleted successfully")
  );
});
