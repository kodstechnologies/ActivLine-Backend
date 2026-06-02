import cron from "node-cron";
import Customer from "../models/Customer/customer.model.js";
import PaymentHistory from "../models/payment/paymentHistory.model.js";
import MaintenanceAlertLog from "../models/Notification/maintenanceAlertLog.model.js";
import { sendMessage } from "../utils/sendMessage.js";
import { SMS_TEMPLATE_ID } from "../constants/sms_template_id.js";

const parseExpirationDate = (dateStr) => {
  if (!dateStr) return null;
  // Try to parse standard "YYYY-MM-DD" or ISO string
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) return d;

  // Try "DD/MM/YYYY" or "DD-MM-YYYY"
  const parts = dateStr.split(/[\/-]/);
  if (parts.length === 3) {
    const parsed = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

export const startPlanExpiryCron = () => {
  // Run every day at 10:00 AM server time
  cron.schedule("0 10 * * *", async () => {
    console.log("[CRON] Running Daily Plan Expiry Check...");
    try {
      // Find active customers who have an expiration date and a valid phone number
      const customers = await Customer.find({
        status: "ACTIVE",
        expirationDate: { $ne: null },
        phoneNumber: { $ne: null, $ne: "" },
      }).select("userName phoneNumber expirationDate");

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const target7Days = today.getTime() + 7 * 24 * 60 * 60 * 1000;
      const target3Days = today.getTime() + 3 * 24 * 60 * 60 * 1000;
      const target0Days = today.getTime();

      for (const customer of customers) {
        const expDate = parseExpirationDate(customer.expirationDate);
        if (!expDate) continue;

        expDate.setHours(0, 0, 0, 0);
        const expTime = expDate.getTime();

        let templateResolver = null;

        if (expTime === target7Days) {
          templateResolver = () =>
            SMS_TEMPLATE_ID.EXPIRY_NOTIFICATION_BEFORE_3_DAYS_NEW(
              expDate.toLocaleDateString("en-IN"),
              "",
            );
        } else if (expTime === target3Days) {
          templateResolver = () =>
            SMS_TEMPLATE_ID.EXPIRY_NOTIFICATION_BEFORE_3_DAYS_NEW(
              expDate.toLocaleDateString("en-IN"),
              "Ignore if paid",
            );
        } else if (expTime === target0Days) {
          templateResolver = () =>
            SMS_TEMPLATE_ID.EXPIRY_NOTIFICATION_ON_DAY_NEW(
              expDate.toLocaleDateString("en-IN"),
              "Ignore if renewed",
            );
        }

        if (templateResolver) {
          try {
            const { ID, MESSAGE } = templateResolver();
            await sendMessage({
              mobile: customer.phoneNumber,
              message: MESSAGE,
              template_id: ID,
            });
            console.log(
              `[CRON] Expiry SMS sent successfully to ${customer.phoneNumber} (User: ${customer.userName}) for date ${expDate.toLocaleDateString()}`,
            );
          } catch (err) {
            console.error(
              `[CRON] Failed to send expiry SMS to ${customer.phoneNumber}:`,
              err.message,
            );
          }
        }
      }
    } catch (error) {
      console.error("[CRON] Error executing Plan Expiry Cron:", error);
    }
  });
};

export const startNextDayRechargeCron = () => {
  // Run daily at 10:15 AM server time
  cron.schedule("15 10 * * *", async () => {
    console.log("[CRON] Running Next-Day Recharge SMS Alert...");
    try {
      const yesterdayStart = new Date();
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      yesterdayStart.setHours(0, 0, 0, 0);

      const yesterdayEnd = new Date();
      yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
      yesterdayEnd.setHours(23, 59, 59, 999);

      const successfulPayments = await PaymentHistory.find({
        status: "SUCCESS",
        paidAt: { $gte: yesterdayStart, $lte: yesterdayEnd },
      }).lean();

      for (const payment of successfulPayments) {
        const customer = await Customer.findOne({
          $or: [
            payment.paidByCustomerId ? { _id: payment.paidByCustomerId } : null,
            { activlineUserId: String(payment.profileId) },
          ].filter(Boolean),
        }).select("phoneNumber userName");

        if (customer?.phoneNumber) {
          const packageName = payment.planName || "Active Plan";
          const paidDate = payment.paidAt
            ? new Date(payment.paidAt).toLocaleDateString("en-IN")
            : new Date().toLocaleDateString("en-IN");

          const { ID, MESSAGE } = SMS_TEMPLATE_ID.ACTIVLINE_NEW_1(
            packageName,
            paidDate,
          );

          await sendMessage({
            mobile: customer.phoneNumber,
            message: MESSAGE,
            template_id: ID,
          });
          console.log(
            `[CRON] Next-day recharge SMS sent to ${customer.phoneNumber} for package ${packageName}`,
          );
        }
      }
    } catch (error) {
      console.error("[CRON] Error executing Next-Day Recharge Cron:", error);
    }
  });
};

export const startCustomerMaintenanceCron = () => {
  // Run every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    console.log("[CRON] Checking Customer Maintenance Scheduled SMS Alerts...");
    try {
      const now = new Date();

      // Find active customers having scheduled maintenance dates
      const customers = await Customer.find({
        status: "ACTIVE",
        "maintenance.lastDate": { $ne: null, $ne: "" },
        "maintenance.endDate": { $ne: null, $ne: "" },
        phoneNumber: { $ne: null, $ne: "" },
      }).select("userName phoneNumber maintenance");

      for (const customer of customers) {
        const { lastDate, endDate } = customer.maintenance;

        // Ensure both strings parse correctly
        const startDate = new Date(lastDate);
        const endDateTime = new Date(endDate);
        if (isNaN(startDate.getTime()) || isNaN(endDateTime.getTime())) {
          continue;
        }

        // 1. Sync or create tracking log for this schedule in the decoupled collection
        let log = await MaintenanceAlertLog.findOne({ customerId: customer._id });

        if (!log) {
          log = await MaintenanceAlertLog.create({
            customerId: customer._id,
            scheduledStartDate: lastDate,
            scheduledEndDate: endDate,
            isTwelveHourSmsSent: false,
            isEndSmsSent: false,
          });
        } else if (
          log.scheduledStartDate !== lastDate ||
          log.scheduledEndDate !== endDate
        ) {
          // If schedule dates changed, reset notification state
          log.scheduledStartDate = lastDate;
          log.scheduledEndDate = endDate;
          log.isTwelveHourSmsSent = false;
          log.isEndSmsSent = false;
          await log.save();
        }

        // 2. Dispatch 12-Hour Warning Alert
        if (!log.isTwelveHourSmsSent) {
          const diffMs = startDate.getTime() - now.getTime();
          const twelveHoursMs = 12 * 60 * 60 * 1000;

          // If start time is within 12 hours and hasn't started yet
          if (diffMs > 0 && diffMs <= twelveHoursMs) {
            const dateStr = startDate.toLocaleDateString("en-IN");
            const startTimeStr = startDate.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const endTimeStr = endDateTime.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const timeRangeStr = `${startTimeStr} to ${endTimeStr}`;

            const { ID, MESSAGE } = SMS_TEMPLATE_ID.MAINTENANCE_ACTIVITY_NOTIFICATION(dateStr, timeRangeStr);

            await sendMessage({
              mobile: customer.phoneNumber,
              message: MESSAGE,
              template_id: ID,
            });

            log.isTwelveHourSmsSent = true;
            await log.save();
            console.log(`[CRON] 12-hr maintenance warning sent to ${customer.phoneNumber}`);
          }
        }

        // 3. Dispatch Completion Alert
        if (!log.isEndSmsSent) {
          // If current time has passed the maintenance end time
          if (now.getTime() >= endDateTime.getTime()) {
            const { ID, MESSAGE } = SMS_TEMPLATE_ID.CLOSE_TICKET_NOTIFICATION(customer.userName || "Customer", "Maintenance");

            await sendMessage({
              mobile: customer.phoneNumber,
              message: MESSAGE,
              template_id: ID,
            });

            log.isEndSmsSent = true;
            await log.save();
            console.log(`[CRON] Maintenance completion alert sent to ${customer.phoneNumber}`);
          }
        }
      }
    } catch (err) {
      console.error("[CRON] Error in Customer Maintenance Cron:", err);
    }
  });
};
