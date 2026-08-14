import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import {
  forgotPasswordService,
  resetPasswordService,
} from "../../services/auth/forgot.service.js";

import {
  validateForgotPassword,
  validateResetPassword,
} from "../../validations/auth/forgot.validator.js";

export const forgotPassword = asyncHandler(async (req, res) => {
  // ✅ VALIDATE INPUT
  validateForgotPassword(req.body);

  const { email } = req.body;

  const otp = await forgotPasswordService(email);

  res.status(200).json(
    ApiResponse.success({ otp }, "OTP sent to email")
  );
});

export const resetPassword = asyncHandler(async (req, res) => {
  // ✅ VALIDATE INPUT
  validateResetPassword(req.body);

  const { email, otp, password } = req.body;

  await resetPasswordService({ email, otp, password });

  res.status(200).json(
    ApiResponse.success(null, "Password reset successful")
  );
});

export const resendForgotPasswordOtp = asyncHandler(async (req, res) => {
  validateForgotPassword(req.body);

  const { email } = req.body;

  const otp = await forgotPasswordService(email);

  res.status(200).json(
    ApiResponse.success({ otp }, "OTP resent to email")
  );
});
