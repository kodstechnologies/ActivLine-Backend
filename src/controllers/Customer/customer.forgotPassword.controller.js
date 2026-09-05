import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiError from "../../utils/ApiError.js";
import Customer from "../../models/Customer/customer.model.js";
import { generateOTP } from "../../utils/otp.util.js";
import { sendOTPEmail } from "../../utils/mail.util.js";
import sendSMS from "../../utils/sendSMS.js";

export const forgotPassword = asyncHandler(async (req, res) => {
  const { identifier } = req.body;

  if (!identifier) {
    throw new ApiError(400, "Email or phone number is required");
  }

  // 1️⃣ Find customer
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

  // 2️⃣ Generate OTP
  const otp = generateOTP();
  console.log("Forgot Password OTP (Customer):", otp);

  // 3️⃣ Save OTP with 10 min expiry
  customer.otp = {
    code: otp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  };

  await customer.save({ validateBeforeSave: false });

  // 4️⃣ Send OTP (Email + SMS if available)
  let emailSent = false;
  let smsSent = false;

  if (customer.emailId) {
    try {
      await sendOTPEmail({
        to: customer.emailId,
        otp,
        purpose: "Password Reset",
      });
      emailSent = true;
      console.log(`✉️ Forgot password OTP sent via Email to ${customer.emailId}`);
    } catch (error) {
      console.error("⚠️ Failed to send Password Reset Email:", error.message);
    }
  }

  if (customer.phoneNumber && process.env.SMS_ENABLED === "true") {
    try {
      await sendSMS(
        customer.phoneNumber,
        `Your ActivLine OTP is ${otp}. Valid for 10 minutes.`
      );
      smsSent = true;
      console.log(`📱 Forgot password OTP sent via SMS to ${customer.phoneNumber}`);
    } catch (error) {
      console.error("⚠️ Failed to send Password Reset SMS:", error.message);
    }
  }

  // If neither delivery method succeeded
  if (!emailSent && !smsSent) {
    throw new ApiError(
      500,
      "Unable to send OTP via Email or SMS. Please check your contact information or contact support."
    );
  }

  res.status(200).json({
    success: true,
    message: "OTP sent successfully",
    otp,
  });
});
