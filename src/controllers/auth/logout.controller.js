import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import { logoutService } from "../../services/auth/logout.service.js";
import { validateLogout } from "../../validations/auth/logout.validator.js";
import { createActivityLog } from "../../services/ActivityLog/activityLog.service.js";

export const logout = asyncHandler(async (req, res) => {
  validateLogout(req.body || {});

  const { fcmToken } = req.body || {};

  await logoutService({
    userId: req.user._id,
    fcmToken,
  });

  await createActivityLog({
    req,
    user: req.user,
    action: "LOGOUT",
    module: "AUTH",
    description: `${req.user.role} logged out`,
    targetId: req.user._id,
    metadata: {
      fcmTokenProvided: Boolean(fcmToken),
    },
  });

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(ApiResponse.success(null, "Logout successful"));
});
