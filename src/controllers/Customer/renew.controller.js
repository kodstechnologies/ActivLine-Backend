import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiError from "../../utils/ApiError.js";
import { renewUserPlan } from "../../services/Customer/renew.service.js";
import Customer from "../../models/Customer/customer.model.js";
import { notifyFranchiseAdmins } from "../../services/Notification/franchise.notification.service.js";
import { notifyCustomer } from "../../services/Notification/customer.notification.service.js";

// export const renew = asyncHandler(async (req, res) => {
//   const payload = req.body || {};

//   const userId = payload.userId;
//   const renewDefaultSettings = payload.renewDefaultSettings;
//   const isRenewPresentDate = payload.isRenewPresentDate;

//   if (!userId || !renewDefaultSettings || !isRenewPresentDate) {
//     throw new ApiError(
//       400,
//       "userId, renewDefaultSettings, and isRenewPresentDate are required"
//     );
//   }

//   const activlineResponse = await renewUserPlan(payload);

//   const { errorCode, status, message, ...rest } = activlineResponse || {};
//   const statusCode =
//     typeof errorCode === "number"
//       ? errorCode
//       : status === "success"
//         ? 200
//         : 500;
//   const success = status === "success" || statusCode < 400;

//   return res.status(statusCode).json({
//     success,
//     message: message || (success ? "Success" : "Error"),
//     data: {
//       status,
//       ...rest,
//       statusCode,
//     },
//   });
// });


export const renew = asyncHandler(async (req, res) => {
  const payload = req.body || {};

  const userId = payload.userId;
  const renewDefaultSettings = payload.renewDefaultSettings;
  const isRenewPresentDate = payload.isRenewPresentDate;

  if (!userId || !renewDefaultSettings || !isRenewPresentDate) {
    throw new ApiError(
      400,
      "userId, renewDefaultSettings, and isRenewPresentDate are required"
    );
  }

  const activlineResponse = await renewUserPlan(payload);

  const { errorCode, status, message, ...rest } = activlineResponse || {};

  const statusCode =
    typeof errorCode === "number"
      ? errorCode
      : status === "success"
      ? 200
      : 500;

  const success = status === "success" || statusCode < 400;

  if (success) {
    try {
      const customer = await Customer.findOne({
        activlineUserId: String(userId),
      }).select("_id userName accountId activlineUserId");

      if (customer?.accountId) {
        await notifyFranchiseAdmins({
          accountId: customer.accountId,
          title: "Plan Renewed",
          message: `Customer ${customer.userName || "Unknown"} renewed a plan`,
          data: {
            customerId: customer._id?.toString() || null,
            activlineUserId: customer.activlineUserId || null,
            type: "PLAN_RENEW",
          },
        });
      }

      if (customer?._id) {
        await notifyCustomer({
          customerId: customer._id,
          title: "Plan Recharge सफल",
          message: "आपका प्लान सफलतापूर्वक रिचार्ज हो गया है।",
          type: "PLAN_RENEW",
          data: {
            activlineUserId: customer.activlineUserId || null,
          },
        });
      }
    } catch (err) {
      console.error("Franchise renew notification failed:", err?.message);
    }
  }

  return res.status(statusCode).json({
    success,
    message: message || "Request processed",
    data: {
      status: status === "success", // ✅ true / false
      ...rest,
      statusCode,
    },
  });
});
