import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiError from "../../utils/ApiError.js";
import Customer from "../../models/Customer/customer.model.js";
import { sendMessage } from "../../utils/sendMessage.js";
import { SMS_TEMPLATE_ID } from "../../constants/sms_template_id.js";

export const resetPassword = asyncHandler(async (req, res) => {
  const { identifier, otp, newPassword, reenterPassword } = req.body;

  // 1️⃣ Validate inputs
  if (!identifier || !otp || !newPassword || !reenterPassword) {
    throw new ApiError(400, "All fields are required");
  }

  if (newPassword !== reenterPassword) {
    throw new ApiError(400, "Passwords do not match");
  }

  // 2️⃣ Find customer
  const emailRegex = new RegExp("^" + identifier.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i");
  const customer = await Customer.findOne({
    $or: [
      { phoneNumber: identifier },
      { emailId: emailRegex },
    ],
  });

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  // 3️⃣ Validate OTP
  if (!customer.otp?.code) {
    throw new ApiError(400, "OTP not requested");
  }

  if (customer.otp.code !== otp) {
    throw new ApiError(400, "Invalid OTP");
  }

  if (customer.otp.expiresAt < new Date()) {
    throw new ApiError(400, "OTP expired");
  }

  // 4️⃣ Update password (BCrypt auto via schema)
  customer.password = newPassword;

  // 5️⃣ Clear OTP
  customer.otp = { code: null, expiresAt: null };

  await customer.save();

  // 📧 Send Password Reset Success SMS Alert (DLT compliant)
  if (customer.phoneNumber) {
    try {
      const name = customer.firstName || customer.userName || "Customer";
      const { ID, MESSAGE } = SMS_TEMPLATE_ID.USER_CHANGE_PASSWORD_ALERT(
        name,
        newPassword
      );

      await sendMessage({
        mobile: customer.phoneNumber,
        message: MESSAGE,
        template_id: ID,
      });
      console.log(`[SMS] Password reset success alert sent to ${customer.phoneNumber} (Name: ${name}, Number: ${customer.phoneNumber}, Password: ${newPassword})`);
    } catch (smsErr) {
      console.error("[SMS] Failed to send password reset success alert:", smsErr.message);
    }
  }

  res.status(200).json({
    success: true,
    message: "Password reset successful",
  });
});
