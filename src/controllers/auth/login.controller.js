import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import ApiError from "../../utils/ApiError.js";
import { loginUser } from "../../services/auth/login.service.js";
import { createActivityLog } from "../../services/ActivityLog/activityLog.service.js";

export const    login = asyncHandler(async (req, res) => {
  let { email, password, fcmToken, deviceId } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  // ✅ Auto-generate FCM Token & Device ID if missing (Helper for Postman/Testing)
  if (!fcmToken) {
    fcmToken = "mock_token_" + Date.now();
  }
  if (!deviceId) {
    deviceId = "mock_device_" + Date.now();
  }

  const result = await loginUser({ email, password, fcmToken, deviceId });

  await createActivityLog({
    req,
    user: result.user,
    action: "LOGIN",
    module: "AUTH",
    description: `${result.user.role} ${result.user.name} logged in successfully from account ${result.user.accountId}`,
  });

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  res
    .status(200)
    .cookie("accessToken", result.accessToken, options)
    .cookie("refreshToken", result.refreshToken, options)
    .json(ApiResponse.success(result, "Login successful"));
});
