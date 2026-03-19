import { firebaseAdmin } from "../../config/firebase.js";
import Admin from "../../models/auth/auth.model.js";
import { buildFcmMulticastMessage } from "../../utils/fcmPayload.js";

export const sendFirebaseNotificationByRoles = async ({
  title,
  message,
  data,
  roles,
}) => {
  if (!firebaseAdmin.apps.length) {
    console.error("❌ Firebase not initialized");
    return;
  }

  const users = await Admin.find({
    role: { $in: roles },
    fcmTokens: { $exists: true, $ne: [] },
  });

  if (!users.length) return;

  const tokens = users
    .flatMap((u) => u.fcmTokens)
    .map((d) => d.token)
    .filter((t) => t && !t.startsWith("mock_token_"));

  if (!tokens.length) return;

  const response = await firebaseAdmin.messaging().sendEachForMulticast(
    buildFcmMulticastMessage({
      tokens,
      title,
      body: message,
      data: {
        type: "LEAD_CREATED",
        payload: data,
      },
    })
  );

  // 🔥 Optional: log failures
  response.responses.forEach((res, idx) => {
    if (!res.success) {
      console.error("❌ Failed token:", tokens[idx], res.error?.message);
    }
  });
};
