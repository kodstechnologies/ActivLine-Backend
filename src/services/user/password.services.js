import userRepo from "../../repositories/user/user.repository.js";
import { ApiError } from "../../utils/ApiError.js";
import { generateOTP } from "../../utils/otp.util.js";
import { generateResetToken } from "../../utils/jwt.js";
import crypto from "crypto";
import { sendMessage } from "../../utils/sendMessage.js";
import { SMS_TEMPLATE_ID } from "../../constants/sms_template_id.js";

class PasswordService {

  // 1️⃣ SEND OTP
  async sendForgotPasswordOTP(identifier) {
    let user;

    if (/^[6-9]\d{9}$/.test(identifier)) {
      user = await userRepo.findByMobile(identifier);
    } else {
      user = await userRepo.findByCustomerId(identifier);
    }

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const otp = generateOTP();

    user.otp = {
      code: otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };

    await user.save();

    // TODO: Replace with SMS / Email provider
    console.log("Forgot Password OTP:", otp);

    return true;
  }

  // 2️⃣ VERIFY OTP → ISSUE RESET JWT
  async verifyOTP(identifier, otp) {
    let user;

    if (/^[6-9]\d{9}$/.test(identifier)) {
      user = await userRepo.findByMobile(identifier);
    } else {
      user = await userRepo.findByCustomerId(identifier);
    }

    if (
      !user ||
      !user.otp ||
      user.otp.code !== otp ||
      user.otp.expiresAt < Date.now()
    ) {
      throw new ApiError(400, "Invalid or expired OTP");
    }

    // OTP single-use
    user.otp = undefined;

    // 🆕 Generate one-time session token
    const session = crypto.randomBytes(16).toString("hex");
    user.passwordResetToken = session;
    await user.save();

    // 🔐 ISSUE RESET JWT
    const resetJwt = generateResetToken({
      userId: user._id,
      role: "PASSWORD_RESET",
      session,
    });

    return resetJwt;
  }

  // 3️⃣ RESET PASSWORD (RESET JWT VERIFIED)
  async resetPassword(userId, newPassword, session) {
    const user = await userRepo.findById(userId);

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // 🆕 Check one-time session
    if (!user.passwordResetToken || user.passwordResetToken !== session) {
      throw new ApiError(400, "Reset link already used or invalid");
    }

    user.password = newPassword; // bcrypt via pre-save
    user.passwordResetToken = undefined; // 🆕 Consume token
    await user.save();

    // 📧 Send Password Reset Success SMS Alert (DLT compliant)
    if (user.mobile) {
      try {
        const name = user.fullName || "User";
        const { ID, MESSAGE } = SMS_TEMPLATE_ID.USER_CHANGE_PASSWORD_ALERT(
          name,
          newPassword
        );

        await sendMessage({
          mobile: user.mobile,
          message: MESSAGE,
          template_id: ID,
        });
        console.log(`[SMS] User password reset success alert sent to ${user.mobile}`);
      } catch (smsErr) {
        console.error("[SMS] Failed to send user password reset success alert:", smsErr.message);
      }
    }

    return true;
  }
}

export default new PasswordService();
