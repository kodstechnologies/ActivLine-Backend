import { asyncHandler } from "../../utils/AsyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { getActivlineUserDetails ,updateUserInActivline} from "../../services/Customer/customerprofile.service.js";

import { generateOtp, verifyOtp } from "../../services/Customer/otp.service.js";
import Customer from "../../models/Customer/customer.model.js";
import { sendMessage } from "../../utils/sendMessage.js";
import { SMS_TEMPLATE_ID } from "../../constants/sms_template_id.js";

export const editUserProfile = asyncHandler(async (req, res) => {
  const { userId, email, phoneNumber, password } = req.body;

  if (!userId) {
    throw new ApiError(400, "userId is required");
  }

  // 🔐 SECURITY CHECK: Ensure Customer edits ONLY their own profile
  if (req.user && req.user.role === "CUSTOMER") {
    // Fetch the full customer profile to get the linked activlineUserId
    const loggedInCustomer = await Customer.findById(req.user._id);

    if (!loggedInCustomer) {
      throw new ApiError(404, "Customer profile not found");
    }

    // Check if the requested userId matches the user's Activline ID
    if (loggedInCustomer.activlineUserId !== userId) {
      throw new ApiError(403, "Unauthorized: You can only edit your own profile");
    }
  }

  let user;

  // 🔐 SAFE Activline Call (401 protected)
  try {
    const current = await getActivlineUserDetails(userId);
    user = current?.[0]?.User;
  } catch (err) {
    console.error("❌ Activline get_details failed:", err.message);
    // Forward the status code from the external API if available, otherwise default to 502 Bad Gateway
    const statusCode = err.response?.status || 502;
    const message = err.response?.data?.message || `Unable to fetch user from Activline: ${err.message}`;
    throw new ApiError(statusCode, message, err.response?.data);
  }

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // 🔍 Detect actual changes
  const updates = {};

  if (email && email !== user.email) {
    updates.email = email;
  }

  if (phoneNumber && phoneNumber !== user.phone) {
    updates.phoneNumber = phoneNumber;
  }

  // ✅ Add password to updates if provided
  if (password) {
    updates.password = password;
  }

  // ❌ Nothing changed
  if (Object.keys(updates).length === 0) {
    return res.json({
      success: true,
      message: "No changes detected"
    });
  }

  // 🔐 Send OTP to OLD registered details
  await generateOtp({
    userId,
    type: "profile",
    newValue: JSON.stringify(updates),
    sendTo: {
      email: user.email || null,
      phone: user.phone || null
    }
  });

  return res.json({
    success: true,
    message: "OTP sent to your registered email and mobile number"
  });
});


export const verifyOtpAndUpdate = asyncHandler(async (req, res) => {
  const { userId, otp } = req.body;

  // 🔐 SECURITY CHECK
  if (req.user && req.user.role === "CUSTOMER") {
    const loggedInCustomer = await Customer.findById(req.user._id);

    if (!loggedInCustomer) {
      throw new ApiError(404, "Customer profile not found");
    }

    if (loggedInCustomer.activlineUserId !== userId) {
      throw new ApiError(
        403,
        "Unauthorized: You can only verify updates for your own profile"
      );
    }
  }

  const record = await verifyOtp({
    userId,
    type: "profile",
    otp
  });

  if (!record) throw new ApiError(400, "Invalid or expired OTP");

  const updates = JSON.parse(record.newValue);

  const payload = { userId };

  if (updates.email) payload.emailId = updates.email;
  if (updates.phoneNumber) payload.phoneNumber = updates.phoneNumber;
  if (updates.password) payload.password = updates.password;

  await updateUserInActivline(payload);

  // ✅ Update Local Database (MongoDB)
  const customer = await Customer.findOne({ activlineUserId: userId });
  if (customer) {
    if (updates.email) customer.emailId = updates.email;
    if (updates.phoneNumber) customer.phoneNumber = updates.phoneNumber;
    if (updates.password) {
      customer.password = updates.password; // pre-save hook will hash this

      // 📧 Send Password Change Alert SMS (DLT compliant)
      if (customer.phoneNumber) {
        try {
          const name = customer.firstName || customer.userName || "Customer";
          const { ID, MESSAGE } = SMS_TEMPLATE_ID.USER_CHANGE_PASSWORD_ALERT(
            name,
            updates.password
          );

          await sendMessage({
            mobile: customer.phoneNumber,
            message: MESSAGE,
            template_id: ID,
          });
          console.log(`[SMS] Password edit profile alert sent to ${customer.phoneNumber}`);
        } catch (smsErr) {
          console.error("[SMS] Failed to send password edit profile alert:", smsErr.message);
        }
      }
    }
    await customer.save();
  }

  record.verified = true;
  await record.save();

  res.json({
    success: true,
    message: "Profile updated successfully"
  });
});
