// services/Notification/firebase.service.js

import { firebaseAdmin as admin } from "../../config/firebase.js";
import { buildFcmMessage } from "../../utils/fcmPayload.js";

export const sendPushNotification = async ({ fcmToken, title, body }) => {
  if (!fcmToken) return;

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
