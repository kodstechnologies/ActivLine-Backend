import Notification from "../../models/Notification/customernotification.model.js";
import CustomerSession from "../../models/Customer/customerLogin.model.js";
import Customer from "../../models/Customer/customer.model.js";
import { sendPushNotification } from "./customerfirebase.service.js";

export const notifyCustomer = async ({
  customerId,
  title,
  message,
  type = "SYSTEM",
  data = {},
}) => {
  // 🔹 1️⃣ Save notification in DB
  const notification = await Notification.create({
    customerId,
    title,
    message,
    type,
    data,
  });

  // 🔹 2️⃣ Fetch active device tokens from Sessions
  const sessions = await CustomerSession.find({
    customerId,
    fcmToken: { $ne: null, $nin: ["", null] },
  }).select("_id fcmToken");

  // Also check Customer document for fallback tokens
  const customerDoc = await Customer.findById(customerId).select("fcmTokens fcmToken");
  const docTokens = [
    ...(customerDoc?.fcmTokens || []),
    customerDoc?.fcmToken,
  ].filter(Boolean);

  const allTokens = [
    ...sessions.map((s) => ({ token: s.fcmToken, sessionId: s._id })),
    ...docTokens.map((t) => ({ token: t, sessionId: null })),
  ];

  // De-duplicate by token string
  const uniqueTokensMap = new Map();
  for (const item of allTokens) {
    if (item.token && !item.token.startsWith("mock_token_") && !uniqueTokensMap.has(item.token)) {
      uniqueTokensMap.set(item.token, item.sessionId);
    }
  }

  if (!uniqueTokensMap.size) {
    console.warn("⚠️ No active FCM tokens for customer:", customerId);
    return notification;
  }

  // 🔹 3️⃣ Send notification to ALL devices
  for (const [token, sessionId] of uniqueTokensMap.entries()) {
    try {
      console.log("📨 Sending FCM to customer:", {
        customerId,
        tokenPreview: String(token).slice(0, 15) + "...",
      });
      await sendPushNotification({
        fcmToken: token,
        title,
        body: message,
        data: {
          type,
          ...data,
        },
      });
    } catch (error) {
      console.error("❌ FCM Send Error:", error?.code, error?.message);

      // 🔥 4️⃣ Auto cleanup invalid / uninstalled tokens
      if (
        error?.code === "messaging/registration-token-not-registered" ||
        error?.code === "messaging/invalid-registration-token" ||
        error?.message?.includes("NotRegistered")
      ) {
        if (sessionId) {
          await CustomerSession.updateOne(
            { _id: sessionId },
            { $set: { fcmToken: null } }
          );
        }
        await Customer.updateOne(
          { _id: customerId },
          { $pull: { fcmTokens: token } }
        );
      }
    }
  }

  return notification;
};
