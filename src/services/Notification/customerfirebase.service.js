// services/Notification/firebase.service.js

import { firebaseAdmin as admin } from "../../config/firebase.js";
import { buildFcmMessage } from "../../utils/fcmPayload.js";

export const sendPushNotification = async ({ fcmToken, title, body }) => {
  if (!fcmToken) return;

  try {
    await admin.messaging().send(
      buildFcmMessage({
        token: fcmToken,
        title,
        body,
      })
    );

    console.log("✅ Push notification sent");
  } catch (err) {
    console.error("❌ Firebase error:", err.message);
  }
};
