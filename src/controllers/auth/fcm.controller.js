import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import ApiError from "../../utils/ApiError.js";
import Admin from "../../models/auth/auth.model.js";
import FranchiseAdmin from "../../models/Franchise/franchiseAdmin.model.js";

export const saveAdminFcmToken = asyncHandler(async (req, res) => {
  const { fcmToken, deviceId } = req.body || {};

  if (!fcmToken) {
    throw new ApiError(400, "fcmToken is required");
  }

  if (!req.user || !req.user.role) {
    throw new ApiError(401, "Unauthorized");
  }

  if (req.user.role === "CUSTOMER") {
    throw new ApiError(403, "Customers must use customer FCM endpoint");
  }

  const resolvedDeviceId = deviceId || `web_${fcmToken}`;

  const Model =
    req.user.role === "FRANCHISE_ADMIN" ? FranchiseAdmin : Admin;

  const user = await Model.findById(req.user._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!user.fcmTokens) user.fcmTokens = [];

  const byDevice = user.fcmTokens.find(
    (d) => d.deviceId === resolvedDeviceId
  );
  const byToken = user.fcmTokens.find((d) => d.token === fcmToken);

  if (byDevice) {
    byDevice.token = fcmToken;
    byDevice.lastUsedAt = new Date();
  } else if (byToken) {
    byToken.deviceId = resolvedDeviceId;
    byToken.lastUsedAt = new Date();
  } else {
    user.fcmTokens.push({
      token: fcmToken,
      deviceId: resolvedDeviceId,
      lastUsedAt: new Date(),
    });
  }

  await user.save({ validateBeforeSave: false });

  res.status(200).json(
    ApiResponse.success(
      { deviceId: resolvedDeviceId },
      "FCM token saved successfully"
    )
  );
});
