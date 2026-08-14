import cron from "node-cron";
import Customer from "../models/Customer/customer.model.js";
import { getUserByUsername } from "../external/activline/activline.profile.api.js";
import { recordDailyUsage } from "../services/Customer/dailyDataUsage.service.js";

export const startDailyDataUsageCron = () => {
  // Scheduled to execute daily at 11:58 PM (local time)
  cron.schedule("58 23 * * *", async () => {
    console.log("[CRON] Running Daily Data Usage Tracking Check...");
    try {
      const customers = await Customer.find({
        status: "ACTIVE",
        activlineUserId: { $ne: null, $ne: "" },
      }).select("userName activlineUserId");

      if (!customers.length) {
        console.log(
          "[CRON] No active customer profiles found for daily data usage tracking.",
        );
        return;
      }

      console.log(
        `[CRON] Found ${customers.length} active customer profiles for daily usage tracking.`,
      );

      for (const customer of customers) {
        try {
          if (!customer.userName) {
            console.log(
              `[CRON] Skipping customer ${customer._id} because userName is missing`,
            );
            continue;
          }
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
          const usageObj = inner.find(
            (item) => item && item.currentBillingCycleUsage,
          );

          if (usageObj?.currentBillingCycleUsage) {
            const usedVolume =
              parseFloat(usageObj.currentBillingCycleUsage.totalDataUsage) || 0;

            // Execute service calculations and persist today's net usage
            await recordDailyUsage(customer, usedVolume);
          } else {
            console.log(
              `[CRON] No billing cycle usage details found for customer ${customer.userName}`,
            );
          }
        } catch (itemErr) {
          console.error(
            `[CRON] Failed to log daily usage for customer ${customer.userName || "Unknown"}:`,
            itemErr.message,
          );
        }
      }
      console.log("[CRON] Daily Data Usage Tracking execution finished.");
    } catch (error) {
      console.error(
        "[CRON] Error during Daily Data Usage Cron execution:",
        error,
      );
    }
  });
};
