import Notification from "../../models/Notification/notification.model.js";
import FranchiseAdmin from "../../models/Franchise/franchiseAdmin.model.js";
import { firebaseAdmin } from "../../config/firebase.js";
import { buildFcmMulticastMessage } from "../../utils/fcmPayload.js";

export const notifyFranchiseAdmins = async ({
  accountId,
  title,
  message,
  data = {},
}) => {
  if (!accountId) return null;

  const admins = await FranchiseAdmin.find({ accountId }).select(
    "_id fcmTokens name"
  );

  if (!admins || admins.length === 0) return null;

  const notifications = admins.map((admin) => ({
    title,
    message,
    data: { accountId, ...data },
    recipientUser: admin._id,
    recipientRole: "FRANCHISE_ADMIN",
  }));

  await Notification.insertMany(notifications);

  const tokens = admins
    .flatMap((a) => a.fcmTokens || [])
    .map((t) => t.token)
    .filter(Boolean);

  const uniqueTokens = [...new Set(tokens)];

  if (uniqueTokens.length > 0) {
    const response = await firebaseAdmin.messaging().sendEachForMulticast(
      buildFcmMulticastMessage({
        tokens: uniqueTokens,
        title,
        body: message,
        data: { accountId, ...data },
      })
    );

    console.log("FCM send result (franchise):", {
      accountId,
      tokens: uniqueTokens.length,
      success: response.successCount,
      failed: response.failureCount,
    });

    if (response.failureCount > 0) {
      const failed = response.responses
        .map((r, i) => ({ r, token: uniqueTokens[i] }))
        .filter((x) => !x.r.success);

      console.warn(
        "FCM send failed (franchise):",
        failed.map((f) => ({
          token: f.token,
          error: f.r.error?.code || f.r.error?.message,
        }))
      );
    }
  }

  return notifications;
};
