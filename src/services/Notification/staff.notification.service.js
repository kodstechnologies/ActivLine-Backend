import Notification from "../../models/Notification/notification.model.js";
import Admin from "../../models/auth/auth.model.js";
import { firebaseAdmin } from "../../config/firebase.js";
import { buildFcmMulticastMessage } from "../../utils/fcmPayload.js";

export const notifyStaffOnTicketAssign = async ({
  staffId,
  room,
  assignedBy,
}) => {
  const notification = await Notification.create({
    title: "Ticket Assigned to You",
    message: `Ticket ${room._id} has been assigned to you`,
    data: {
      roomId: room._id.toString(),
      status: room.status,
      assignedBy: assignedBy.name,
    },
    recipientUser: staffId,
    recipientRole: "ADMIN_STAFF",
  });

  const staff = await Admin.findById(staffId).select("fcmTokens");
  const tokens = [...new Set((staff?.fcmTokens || []).map((item) => item.token).filter(Boolean))];

  if (!tokens.length) {
    console.warn(`[staff.notify] No FCM tokens found for staff ${staffId}`);
    return notification;
  }

  if (!firebaseAdmin) {
    console.warn("[staff.notify] Firebase Admin SDK is not initialized");
    return notification;
  }

  try {
    const response = await firebaseAdmin.messaging().sendEachForMulticast(
      buildFcmMulticastMessage({
        tokens,
        title: notification.title,
        body: notification.message,
        data: {
          roomId: room._id.toString(),
          type: "TICKET_ASSIGNED",
          notificationId: notification._id.toString(),
        },
      })
    );

    const invalidTokens = [];

    response.responses.forEach((result, index) => {
      if (result.success) return;

      const code = result.error?.code || "unknown";
      console.error(
        `[staff.notify] FCM failed for staff ${staffId}, token index ${index}: ${code}`
      );

      if (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered"
      ) {
        invalidTokens.push(tokens[index]);
      }
    });

    if (invalidTokens.length) {
      await Admin.updateOne(
        { _id: staffId },
        { $pull: { fcmTokens: { token: { $in: invalidTokens } } } }
      );
    }
  } catch (error) {
    console.error(
      `[staff.notify] Failed to send assignment notification to staff ${staffId}:`,
      error?.message || error
    );
  }

  return notification;
};
