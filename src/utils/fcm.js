// src/utils/fcm.js
import { firebaseAdmin } from "../config/firebase.js";
import { buildFcmMessage } from "./fcmPayload.js";

export const sendFCM = async (token, title, body) => {
  if (!token) return;

  if (!firebaseAdmin) {
    console.warn(
      "⚠️ FCM notification skipped: Firebase Admin SDK is not initialized."
    );
    return;
  }

  try {
    await firebaseAdmin.messaging().send(
      buildFcmMessage({
        token,
        title,
        body,
      })
    );
  } catch (error) {
    console.error("❌ Failed to send FCM message:", error.message);
  }
};

