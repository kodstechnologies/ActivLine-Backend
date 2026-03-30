import Notification from "../../models/Notification/customernotification.model.js";
import CustomerSession from "../../models/Customer/customerLogin.model.js";
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

  // 🔹 2️⃣ Fetch ALL active device tokens
  const sessions = await CustomerSession.find({
    customerId,
    fcmToken: { $ne: null },
  }).select("fcmToken");

  if (!sessions.length) {
    console.warn("⚠️ No active FCM sessions for customer:", customerId);
    return notification; // No devices logged in
  }

  // 🔹 3️⃣ Send notification to ALL devices
  for (const session of sessions) {
    try {
      console.log("📨 Sending FCM to customer:", {
        customerId,
        tokenPreview: String(session.fcmToken || "").slice(0, 12) + "...",
      });
      await sendPushNotification({
        fcmToken: session.fcmToken,
        title,
        body: message,
      });
    } catch (error) {
      console.error("❌ FCM Send Error:", error.message);

      // 🔥 4️⃣ Auto cleanup invalid tokens
      if (
        error.code === "messaging/registration-token-not-registered"
      ) {
        await CustomerSession.updateOne(
          { _id: session._id },
          { $set: { fcmToken: null } }
        );
      }
    }
  }

  return notification;
};
