// services/Notification/firebase.service.js

import { firebaseAdmin as admin } from "../../config/firebase.js";
import { buildFcmMessage } from "../../utils/fcmPayload.js";

export const sendPushNotification = async ({ fcmToken, title, body }) => {
  if (!fcmToken) return;

  if (!admin) {
    console.warn("⚠️ FCM skipped: Firebase Admin SDK is not initialized.");
    return;
  }

  try {
    const response = await admin.messaging().send(
      buildFcmMessage({
        token: fcmToken,
        title,
        body,
      })
    );

    console.log("✅ Push notification sent", { messageId: response });
  } catch (err) {
    console.error("❌ Firebase error:", err.message);
  }
};
