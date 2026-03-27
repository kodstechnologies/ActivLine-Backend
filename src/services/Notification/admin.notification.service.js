import Notification from "../../models/Notification/notification.model.js";
import Admin from "../../models/auth/auth.model.js";
import { firebaseAdmin } from "../../config/firebase.js";
import { buildFcmMulticastMessage } from "../../utils/fcmPayload.js";

export const notifyAdmins = async ({
  title,
  message,
  data = {},
  roles = ["ADMIN", "SUPER_ADMIN", "ADMIN_STAFF"],
}) => {
  const normalizedRoles = roles
    .map((role) => String(role || "").toUpperCase())
    .filter(Boolean);

  if (!normalizedRoles.length) return null;

  const admins = await Admin.find({
    role: { $in: normalizedRoles },
  }).select("_id role fcmTokens");

  if (!admins || admins.length === 0) return null;

  const notifications = admins.map((admin) => ({
    title,
    message,
    data: { ...data },
    recipientUser: admin._id,
    recipientRole: admin.role,
  }));

  await Notification.insertMany(notifications);

  const tokens = admins
    .flatMap((a) => a.fcmTokens || [])
    .map((t) => t.token)
    .filter(Boolean);

  const uniqueTokens = [...new Set(tokens)];

  if (uniqueTokens.length > 0) {
    try {
      await firebaseAdmin.messaging().sendEachForMulticast(
        buildFcmMulticastMessage({
          tokens: uniqueTokens,
          title,
          body: message,
          data: { ...data },
        })
      );
    } catch (err) {
      console.error("FCM send failed (admin):", err?.message || err);
    }
  }

  return notifications;
};
