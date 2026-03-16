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
  const customer = await Customer.findOne({
    $or: [
      { phoneNumber: identifier },
      { emailId: identifier.toLowerCase() },
    ],
  });

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  // 2️⃣ Generate OTP
  const otp = generateOTP();

  // 3️⃣ Save OTP with 10 min expiry
 customer.otp = {
  code: otp,
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
};

await customer.save({ validateBeforeSave: false }); // ✅ FIX


  // 4️⃣ Send OTP (Email + SMS if available)

  if (customer.emailId) {
    await sendOTPEmail({
      to: customer.emailId,
      otp,
      purpose: "Password Reset",
    });
  }

  if (customer.phoneNumber && process.env.SMS_ENABLED === "true") {
    await sendSMS(
      customer.phoneNumber,
      `Your ActivLine OTP is ${otp}. Valid for 10 minutes.`
    );
  }

  res.status(200).json({
    success: true,
    message: "OTP sent successfully",
  });
});
