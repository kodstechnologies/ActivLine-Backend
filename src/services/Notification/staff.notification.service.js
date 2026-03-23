// src/services/Notification/staff.notification.service.js
import Notification from "../../models/Notification/notification.model.js";
import Admin from "../../models/auth/auth.model.js";
import { firebaseAdmin } from "../../config/firebase.js";
import { buildFcmMulticastMessage } from "../../utils/fcmPayload.js";

export const notifyStaffOnTicketAssign = async ({
  staffId,
  room,
  assignedBy,
}) => {
  console.log("FCM staff assign: start", {
    staffId,
    roomId: room?._id?.toString(),
  });
  // ✅ Save notification in DB
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

  // ✅ Send Firebase push
  const staff = await Admin.findById(staffId).select("fcmTokens");

  console.log("FCM staff assign: tokens found", {
    staffId,
    tokenCount: staff?.fcmTokens?.length || 0,
  });

  if (staff?.fcmTokens && staff.fcmTokens.length > 0) {
    const tokens = staff.fcmTokens.map((t) => t.token).filter(Boolean);

    if (tokens.length > 0) {
      const response = await firebaseAdmin.messaging().sendEachForMulticast(
        buildFcmMulticastMessage({
          tokens,
          title: notification.title,
          body: notification.message,
          data: {
            roomId: room._id.toString(),
            type: "TICKET_ASSIGNED",
          },
        })
      );

      console.log(
        "FCM send result (staff assign):",
        {
          tokens: tokens.length,
          success: response.successCount,
          failed: response.failureCount,
        }
      );

      if (response.failureCount > 0) {
        const failed = response.responses
          .map((r, i) => ({ r, token: tokens[i] }))
          .filter((x) => !x.r.success);

        console.warn(
          "FCM send failed (staff assign):",
          failed.map((f) => ({
            token: f.token,
            error: f.r.error?.code || f.r.error?.message,
          }))
        );
      }
    }
  }

  return notification;
};
