import ApiError from "../../utils/ApiError.js";
import { generateOTP } from "../../utils/otp.util.js";
import { sendOTPEmail } from "../../utils/mail.util.js";
import * as ForgotRepo from "../../repositories/auth/forgot.repository.js";

/**
 * SEND OTP
 */
export const forgotPasswordService = async (email) => {
  const userInfo = await ForgotRepo.findUserByEmail(email);
  if (!userInfo?.user) {
    throw new ApiError(404, "Email not registered");
  }

  const { user, model } = userInfo;

  // ⏳ Prevent OTP spam (1 minute cooldown)
  // resetOTPExpiry is sentAt + OTP_TTL. Allow resend only after 1 minute.
  const OTP_TTL_MS = 5 * 60 * 1000;
  const COOLDOWN_MS = 60 * 1000;
  const expiryMs = user.resetOTPExpiry
    ? new Date(user.resetOTPExpiry).getTime()
    : null;
  if (expiryMs && expiryMs > Date.now() + (OTP_TTL_MS - COOLDOWN_MS)) {
    throw new ApiError(429, "OTP already sent. Please wait 1 minute");
  }

  const otp = generateOTP();

  await ForgotRepo.saveOTP(user._id, String(otp), model);

  // ✅ SEND EMAIL
  await sendOTPEmail({
    to: email,
    otp,
  });
};

/**
 * RESET PASSWORD
 */
export const resetPasswordService = async ({ email, otp, password }) => {
  const userInfo = await ForgotRepo.findValidOTPUser(email, String(otp));
  if (!userInfo?.user) {
    throw new ApiError(400, "Invalid or expired OTP");
  }

  await ForgotRepo.updatePassword(userInfo.user._id, password, userInfo.model);
};
