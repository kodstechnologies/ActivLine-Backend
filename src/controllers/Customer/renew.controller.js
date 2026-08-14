import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiError from "../../utils/ApiError.js";
import { renewUserPlan } from "../../services/Customer/renew.service.js";
import Customer from "../../models/Customer/customer.model.js";
import PaymentHistory from "../../models/payment/paymentHistory.model.js";
import { notifyFranchiseAdmins } from "../../services/Notification/franchise.notification.service.js";
import { notifyCustomer } from "../../services/Notification/customer.notification.service.js";
import {
  getProfileDetails,
  getUserByUsername,
} from "../../external/activline/activline.profile.api.js";
import { sendMessage } from "../../utils/sendMessage.js";
import { fetchProfilesWithDetailsByFranchise } from "../../services/franchise/profile.service.js";
import { SMS_TEMPLATE_ID } from "../../constants/sms_template_id.js";
import { resetUsageHistory } from "../../services/Customer/dailyDataUsage.service.js";

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
      "userId, renewDefaultSettings, and isRenewPresentDate are required",
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
      }).select("_id userName accountId activlineUserId phoneNumber userGroupId");

      if (customer?._id) {
        await resetUsageHistory(customer._id).catch((resetErr) => {
          console.error(
            "Failed to reset customer data usage history on renew:",
            resetErr.message,
          );
        });
      }

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

      if (customer?.phoneNumber) {
        try {
          let planAmount = 0;

          // 1. Try to fetch from the latest successful payment history of this customer
          try {
            const latestPayment = await PaymentHistory.findOne({
              status: "SUCCESS",
              $or: [
                { paidByCustomerId: customer._id },
                { paidByPhone: customer.phoneNumber },
                { paidByUserName: customer.userName }
              ]
            }).sort({ paidAt: -1, createdAt: -1 });

            if (latestPayment?.planAmount) {
              planAmount = Number(latestPayment.planAmount);
            }
          } catch (payErr) {
            console.error("Failed to fetch plan amount from payment history:", payErr.message);
          }

          // 2. If not found, try fetching from the franchise profile details matching the groupId
          const targetGroupId = payload.groupId || customer.userGroupId;
          if (!planAmount && customer.accountId && targetGroupId) {
            try {
              const profileResult = await fetchProfilesWithDetailsByFranchise(
                customer.accountId
              );

              const profilesList =
                profileResult?.items ||
                profileResult?.profiles ||
                profileResult?.data?.profiles ||
                [];

              const matchedProfile = profilesList.find(
                (p) => String(p?.Profile?.groupId || p?.groupId || "") === String(targetGroupId),
              );

              const details =
                matchedProfile?.details || profileResult?.item?.details || {};
              const billingRows = details?.["billing Details"] || [];
              const totalPriceRow = billingRows.find(
                (row) =>
                  String(row?.property || "")
                    .toLowerCase()
                    .trim() === "total price",
              );
              if (totalPriceRow?.value) {
                planAmount = Number(totalPriceRow.value);
              }
            } catch (fetchErr) {
              console.error(
                "Failed to fetch plan amount from profile details:",
                fetchErr.message,
              );
            }
          }

          if (!planAmount) {
            planAmount = 799; // Fallback default
          }

          const { ID, MESSAGE } = SMS_TEMPLATE_ID.RENEWAL_NEW(
            customer.userName || "Customer",
            `Internet Rs.${planAmount}`,
            new Date().toLocaleDateString(),
            "Activline Team"
          );
          await sendMessage({
            mobile: customer.phoneNumber,
            message: MESSAGE,
            template_id: ID,
          });
          console.log(
            `[SMS] Plan buy/renew notification sent to ${customer.phoneNumber} with amount ${planAmount}`,
          );
        } catch (smsErr) {
          console.error(
            `[SMS] Failed to send buy/renew notification:`,
            smsErr.message,
          );
        }
      }
    } catch (err) {
      console.error("Franchise renew notification failed:", err?.message);
    }

    try {
      const customer = await Customer.findOne({
        activlineUserId: String(userId),
      }).select("userName");

      if (customer?.userName) {
        const userRes = await getUserByUsername(customer.userName);
        const getInnerArray = (res) => {
          if (!res) return [];
          if (Array.isArray(res)) {
            if (Array.isArray(res[0])) return res[0];
            return res;
          }
          if (Array.isArray(res.data)) return res.data;
          return [];
        };
        const inner = getInnerArray(userRes);
        const userObj = inner.find((item) => item && item.User);
        const expirationTime = userObj?.User?.expirationTime;

        if (expirationTime) {
          const expirationDate = expirationTime.split(" ")[0]; // Get YYYY-MM-DD
          await Customer.updateOne(
            { activlineUserId: String(userId) },
            { $set: { expirationDate } },
          );
        }
      }
    } catch (err) {
      console.error(
        "Failed to update expiration date locally after renew:",
        err?.message,
      );
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
