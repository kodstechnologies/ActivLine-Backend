import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import { ApiError } from "../../utils/ApiError.js";
import passwordService from "../../services/user/password.services.js";

// 1️⃣ SEND OTP (PUBLIC)
export const forgotPassword = asyncHandler(async (req, res) => {
  const { identifier } = req.body;

  if (!identifier) {
    throw new ApiError(400, "Identifier is required");
  }

  const otp = await passwordService.sendForgotPasswordOTP(identifier);

  res.status(200).json(
    ApiResponse.success({ otp }, "OTP sent successfully")
  );
});

// 2️⃣ VERIFY OTP → RETURNS RESET JWT
export const verifyOTP = asyncHandler(async (req, res) => {
  const { identifier, otp } = req.body;

  if (!identifier || !otp) {
    throw new ApiError(400, "Identifier and OTP are required");
  }

  const resetToken = await passwordService.verifyOTP(
    identifier,
    otp
  );

  res.status(200).json(
    ApiResponse.success(
      { resetToken },
      "OTP verified successfully"
    )
  );
});

// 3️⃣ RESET PASSWORD → RESET JWT VERIFIED
export const resetPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword) {
    throw new ApiError(400, "New password is required");
  }

  await passwordService.resetPassword(
    req.resetUser.userId,
    newPassword,
    req.resetUser.session
  );

  res.status(200).json(
    ApiResponse.success(null, "Password reset successful")
  );
});
