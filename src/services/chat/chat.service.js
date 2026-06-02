// src/services/chat/chat.service.js

import mongoose from "mongoose";
import * as ChatRoomRepo from "../../repositories/chat/chatRoom.repository.js";
import * as ChatMsgRepo from "../../repositories/chat/chatMessage.repository.js";
import ChatMessage from "../../models/chat/chatMessage.model.js";
import ChatRoom from "../../models/chat/chatRoom.model.js";
import ActivityLog from "../../models/ActivityLog/activityLog.model.js";
import { createActivityLog } from "../ActivityLog/activityLog.service.js";
import { getIO } from "../../socket/index.js";
import ApiError from "../../utils/ApiError.js";
import crypto from "crypto";
import { notifyCustomer } from "../Notification/customer.notification.service.js";
import CustomerNotification from "../../models/Notification/customernotification.model.js";
import Notification from "../../models/Notification/notification.model.js";
import { notifyFranchiseAdmins } from "../Notification/franchise.notification.service.js";
import { notifyAdmins } from "../Notification/admin.notification.service.js";
import Customer from "../../models/Customer/customer.model.js";
import { sendMessage } from "../../utils/sendMessage.js";
import cannedResponseModel from "../../models/admin/Settings/cannedResponse.model.js";
import { SMS_TEMPLATE_ID } from "../../constants/sms_template_id.js";

const getResolvedTicketSMSTemplate = (msgText, customerName, roomId) => {
  const normalized = String(msgText || "").toLowerCase();

  if (normalized.includes("website") || normalized.includes("portal")) {
    return {
      ID: 1007608792688525372,
      MESSAGE: `Dear customer, Website issue has been resolved and working fine now. As confirming with you we are closing the Ticket ${roomId}Regards Activline Telecom.`,
    };
  }

  if (
    normalized.includes("fiber") ||
    normalized.includes("wire") ||
    normalized.includes("physical")
  ) {
    return {
      ID: 1007256105097447042,
      MESSAGE: `Dear customer, Fiber  issue has been resolved and internet is working fine now. As confirming with you we are closing the ticket ${roomId}Regards Activline Telecom.`,
    };
  }

  if (
    normalized.includes("speed") ||
    normalized.includes("slow") ||
    normalized.includes("bandwidth")
  ) {
    return {
      ID: 1007386287270172838,
      MESSAGE: `Dear customer, Speed issue has been resolved and internet is working fine now. As confirming with you we are closing the ticket ${roomId} Regards Activline Telecom.`,
    };
  }

  if (
    normalized.includes("disconnect") ||
    normalized.includes("drop") ||
    normalized.includes("flapping")
  ) {
    return {
      ID: 1007649448830335851,
      MESSAGE: `Dear customer, Frequent disconnection issue has been resolved and internet is working fine now. As confirming with you we are closing the Ticket ${roomId}Regards Activline Telecom.`,
    };
  }

  return SMS_TEMPLATE_ID.CLOSE_TICKET_NOTIFICATION(customerName, roomId);
};
/**
 * ===============================
 * ADMIN → FETCH ALL ROOMS
 * ===============================
 */

export const getAllRooms = async ({ status }) => {
  const filter = { isConnectedToAgent: true };

  // ✅ Apply filter ONLY when valid
  if (
    status &&
    ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)
  ) {
    filter.status = status;
  }

  return ChatRoomRepo.getAll(filter);
};

/**
 * ===============================
 * CUSTOMER → OPEN CHAT
 * ===============================
 */
export const openChatIfNotExists = async (req) => {
  const customerId = req.user._id;
  const { message, titleId } = req.body;

  // ✅ Generate 10-digit numeric ID
  const roomId = crypto.randomInt(1000000000, 10000000000).toString();

  // ✅ ALWAYS CREATE NEW ROOM (no reuse)
  const room = await ChatRoomRepo.createRoom({
    _id: roomId,
    customer: customerId,
    status: "OPEN",
    isConnectedToAgent: false,
  });

  // ✅ ACTIVITY LOG
  await createActivityLog({
    req,
    action: "CREATE",
    module: "TICKET",
    description: "Customer created a new support ticket",
    targetId: room._id,
  });

  // ✅ Send default massage from SuperAdmin
  const defaultMessage = "What can I help you with?.";
  await ChatMsgRepo.saveMessage({
    roomId: room._id,
    senderId: "000000000000000000000000", // Placeholder ID for SuperAdmin
    senderModel: "Admin",
    senderRole: "SUPER_ADMIN",
    message: defaultMessage,
    messageType: "TEXT",
    statusAtThatTime: room.status,
  });

  await ChatRoomRepo.updateRoomLastMessage(room._id, {
    lastMessage: defaultMessage,
    lastMessageAt: new Date(),
  });

  // ✅ SAVE FIRST MESSAGE (optional)
  if (message && message.trim()) {
    await ChatMsgRepo.saveMessage({
      roomId: room._id,
      senderId: customerId,
      senderModel: "Customer",
      senderRole: "CUSTOMER",
      message: message.trim(),
      messageType: "TEXT",
      statusAtThatTime: room.status,
    });

    const answer = await cannedResponseModel
      .findById(titleId)
      .select("message");

    await ChatMsgRepo.saveMessage({
      roomId: room._id,
      senderId: "000000000000000000000000", // Placeholder ID for SuperAdmin
      senderModel: "Admin",
      senderRole: "SUPER_ADMIN",
      message: answer?.message || "",
      messageType: "TEXT",
      statusAtThatTime: room.status,
    });

    await ChatMsgRepo.saveMessage({
      roomId: room._id,
      senderId: "000000000000000000000000", // Placeholder ID for SuperAdmin
      senderModel: "Admin",
      senderRole: "SUPER_ADMIN",
      message: "Issue Resolved",
      messageType: "TEXT",
      statusAtThatTime: room.status,
    });

    await ChatMsgRepo.saveMessage({
      roomId: room._id,
      senderId: "000000000000000000000000", // Placeholder ID for SuperAdmin
      senderModel: "Admin",
      senderRole: "SUPER_ADMIN",
      message: "Connect to an Agent",
      messageType: "TEXT",
      statusAtThatTime: room.status,
    });

    await ChatRoomRepo.updateRoomLastMessage(room._id, {
      lastMessage: message.trim(),
      lastMessageAt: new Date(),
    });
  }

  // Dynamic DLT Ticket Raised SMS Dispatch
  try {
    const customer = await Customer.findById(customerId).select(
      "phoneNumber userName firstName",
    );
    if (customer && customer.phoneNumber) {
      setImmediate(async () => {
        try {
          const msgText = String(message || "").toLowerCase();
          let smsData = null;
          const currentDate = new Date().toLocaleDateString();

          if (msgText.includes("website") || msgText.includes("portal")) {
            smsData = {
              ID: 1007996733874596669,
              MESSAGE: `Dear customer, As per your complaint regarding website issue on ${currentDate} we raised a ticket for the same. Ticket number is ${room._id}Regards Activline Telecom`,
            };
          } else if (
            msgText.includes("fiber") ||
            msgText.includes("wire") ||
            msgText.includes("physical")
          ) {
            smsData = {
              ID: 1007622560254686299,
              MESSAGE: `Dear customer, As per your complaint regarding Fiber issue on ${currentDate} we raised a ticket for the same. Ticket number is ${room._id}Regards Activline Telecom`,
            };
          } else if (
            msgText.includes("speed") ||
            msgText.includes("slow") ||
            msgText.includes("bandwidth")
          ) {
            smsData = {
              ID: 1007970476073105752,
              MESSAGE: `Dear customer, As per your complaint regarding speed issue on ${currentDate} we raised a ticket for the same. Ticket number is ${room._id}Regards Activline Telecom`,
            };
          } else if (
            msgText.includes("disconnect") ||
            msgText.includes("drop") ||
            msgText.includes("flapping")
          ) {
            smsData = SMS_TEMPLATE_ID.FREQUENT_DISCONNECTION
              ? SMS_TEMPLATE_ID.FREQUENT_DISCONNECTION(currentDate, room._id)
              : null;
          }

          if (!smsData) {
            smsData = SMS_TEMPLATE_ID.RAISE_TICKET_NOTIFICATION(
              customer.userName || customer.firstName || "Customer",
              room._id,
              message?.trim() ? message.trim().slice(0, 30) : "General Issue",
            );
          }

          if (smsData && smsData.ID) {
            await sendMessage({
              mobile: customer.phoneNumber,
              message: smsData.MESSAGE,
              template_id: smsData.ID,
            });
            console.log(
              `[SMS] Ticket Raised SMS successfully sent to ${customer.phoneNumber} for ticket ${room._id}`,
            );
          }
        } catch (smsErr) {
          console.error(
            "[SMS] Failed to send raised ticket notification:",
            smsErr.message,
          );
        }
      });
    }
  } catch (err) {
    console.error("Failed to trigger raised ticket check:", err.message);
  }

  // try {
  //   const customer = await Customer.findById(customerId).select(
  //     "accountId userName activlineUserId",
  //   );

  //   await notifyAdmins({
  //     title: "New Ticket Created",
  //     message: `Ticket ${room._id} created by ${customer?.userName || "Customer"}`,
  //     data: {
  //       ticketId: room._id,
  //       status: "OPEN",
  //       customerId: customerId?.toString() || null,
  //       accountId: customer?.accountId || null,
  //       activlineUserId: customer?.activlineUserId || null,
  //       type: "TICKET_CREATED",
  //     },
  //   });
  // } catch (err) {
  //   console.error("Admin ticket notification failed:", err?.message);
  // }

  return room;
};

// import { notifyCustomer } from "../Notification/customer.notification.service.js";

export const updateTicketStatus = async (req, roomId, newStatus) => {
  const room = await ChatRoomRepo.findById(roomId);
  if (!room) throw new ApiError(404, "Ticket not found");

  const userRole = req.user.role;
  const currentStatus = room.status;

  const allowedTransitions = {
    OPEN: ["IN_PROGRESS", "RESOLVED", "CLOSED", "OPEN"],
    ASSIGNED: ["IN_PROGRESS", "RESOLVED", "CLOSED", "OPEN"],
    IN_PROGRESS: ["RESOLVED", "CLOSED", "IN_PROGRESS"],
    RESOLVED: ["CLOSED", "OPEN", "IN_PROGRESS", "RESOLVED"],
    CLOSED: ["CLOSED"],
  };

  if (!allowedTransitions[currentStatus].includes(newStatus)) {
    throw new ApiError(
      400,
      `Invalid status change from ${currentStatus} to ${newStatus}`,
    );
  }

  if (
    ["IN_PROGRESS", "RESOLVED", "CLOSED"].includes(newStatus) &&
    !["ADMIN", "SUPER_ADMIN", "ADMIN_STAFF", "FRANCHISE_ADMIN"].includes(
      userRole,
    )
  ) {
    throw new ApiError(403, "You are not allowed to update ticket status");
  }

  // 🔐 FRANCHISE ADMIN CHECK: Can only manage own franchise tickets
  if (userRole === "FRANCHISE_ADMIN") {
    if (!room.customer || room.customer.accountId !== req.user.accountId) {
      throw new ApiError(
        403,
        "Access denied: You can only manage tickets for your franchise",
      );
    }
  }

  // ─── CLOSE ──────────────────────────────────────────────────────────────────
  // Room + messages are kept in DB permanently.
  if (newStatus === "CLOSED") {
    // 1️⃣ Activity log (recorded before any mutation)
    await createActivityLog({
      req,
      action: "UPDATE",
      module: "TICKET",
      description: `Ticket status changed from ${currentStatus} to CLOSED`,
      targetId: roomId,
      metadata: { from: currentStatus, to: "CLOSED" },
    });

    // 2️⃣ Update status to CLOSED
    const closedRoom = await ChatRoomRepo.updateStatus(roomId, "CLOSED");

    // 3️⃣ Post a visible system message inside the chat
    const senderModel =
      req.user.role === "FRANCHISE_ADMIN" ? "FranchiseAdmin" : "Admin";

    const systemMsg = await ChatMsgRepo.saveMessage({
      roomId,
      senderId: req.user._id,
      senderModel,
      senderRole: req.user.role,
      message: `This ticket has been closed.`,
      messageType: "TEXT",
      statusAtThatTime: "CLOSED",
    });

    try {
      const populatedMsg = await ChatMessage.findById(systemMsg._id).populate(
        "senderId",
        "fullName name email mobile role"
      );
      getIO().to(roomId).emit("new-message", populatedMsg);
    } catch (socketErr) {
      console.error("❌ Failed to emit closed system message via socket:", socketErr.message);
    }

    // 4️⃣ Clean up OLD room-linked notifications (same as original design)
    await Promise.all([
      CustomerNotification.deleteMany({ "data.roomId": roomId }),
      Notification.deleteMany({ "data.roomId": roomId }),
    ]);
    console.log(room.customer._id);
    // 5️⃣ Notify customer about closure
    try {
      await notifyCustomer({
        customerId: room.customer._id,
        type: "TICKET",
        data: { roomId, ticketId: roomId, status: "CLOSED" },
        title: "Ticket Closed",
        message: `Your support ticket has been closed (Ticket ID: ${roomId}).`,
      });
    } catch (err) {
      console.error(
        "Customer closed-ticket notification failed:",
        err?.message,
      );
    }

    // 6️⃣ Notify franchise admins + system admins
    try {
      const accountId = room.customer?.accountId || null;
      if (accountId) {
        await notifyFranchiseAdmins({
          accountId,
          title: "Ticket Closed",
          message: `Ticket ${roomId} closed`,
          data: {
            ticketId: roomId,
            status: "CLOSED",
            customerId: room.customer?._id?.toString() || null,
            type: "TICKET_CLOSED",
          },
        });
      }
      await notifyAdmins({
        title: "Ticket Closed",
        message: `Ticket ${roomId} closed`,
        data: {
          ticketId: roomId,
          status: "CLOSED",
          customerId: room.customer?._id?.toString() || null,
          accountId,
          type: "TICKET_CLOSED",
        },
      });
    } catch (err) {
      console.error("Ticket closed notification failed:", err?.message);
    }

    // Send SMS when ticket is closed
    if (room.customer?.phoneNumber) {
      try {
        const customerName = room.customer.firstName || "Customer";
        const firstMsg = await ChatMessage.findOne({
          roomId,
          senderRole: "CUSTOMER",
        })
          .sort({ createdAt: 1 })
          .select("message");
        const { ID, MESSAGE } = getResolvedTicketSMSTemplate(
          firstMsg?.message || "",
          customerName,
          roomId,
        );
        await sendMessage({
          mobile: room.customer.phoneNumber,
          message: MESSAGE,
          template_id: ID,
        });
      } catch (smsErr) {
        console.error("⚠️ Failed to send Ticket Closed SMS:", smsErr?.message);
      }
    }

    return closedRoom;
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Handle reopen ticket notification (transitions from RESOLVED/CLOSED to OPEN)
  if (
    (currentStatus === "RESOLVED" || currentStatus === "CLOSED") &&
    newStatus === "OPEN"
  ) {
    try {
      const customer = await Customer.findById(room.customer).select(
        "phoneNumber userName firstName",
      );
      if (customer && customer.phoneNumber) {
        setImmediate(async () => {
          try {
            const reopenCount = await ActivityLog.countDocuments({
              module: "TICKET",
              targetId: roomId,
              "metadata.to": "OPEN",
            });
            const actualCount = reopenCount + 1;

            const { ID, MESSAGE } = SMS_TEMPLATE_ID.REOPEN_TICKET_NOTIFICATION(
              customer.userName || customer.firstName || "Customer",
              roomId,
              actualCount,
            );

            await sendMessage({
              mobile: customer.phoneNumber,
              message: MESSAGE,
              template_id: ID,
            });
            console.log(
              `[SMS] Reopen SMS alert sent successfully to ${customer.phoneNumber} for ticket ${roomId} (reopened ${actualCount} times).`,
            );
          } catch (smsErr) {
            console.error(
              "[SMS] Failed to send reopen SMS alert:",
              smsErr.message,
            );
          }
        });
      }
    } catch (err) {
      console.error(
        "[SMS] Failed to trigger reopen ticket check:",
        err.message,
      );
    }
  }

  const updatedRoom = await ChatRoomRepo.updateStatus(roomId, newStatus);

  await createActivityLog({
    req,
    action: "UPDATE",
    module: "TICKET",
    description: `Ticket status changed from ${currentStatus} to ${newStatus}`,
    targetId: roomId,
    metadata: {
      from: currentStatus,
      to: newStatus,
    },
  });

  // 🔍 Find the first message sent by the customer
  const firstCustomerMsg = await ChatMessage.findOne({
    roomId,
    senderRole: "CUSTOMER",
  })
    .sort({ createdAt: 1 })
    .select("message");

  let statusMessage = `Status changed to ${newStatus}\nTicket ID: ${roomId}`;

  if (firstCustomerMsg?.message) {
    statusMessage += `\n\nTicket: ${firstCustomerMsg.message}`;
  }

  const systemMsg = await ChatMsgRepo.saveMessage({
    roomId,
    senderId: req.user._id,
    senderModel:
      req.user.role === "FRANCHISE_ADMIN" ? "FranchiseAdmin" : "Admin",
    senderRole: req.user.role,
    message: statusMessage,
    messageType: "TEXT",
    statusAtThatTime: newStatus,
  });

  try {
    const populatedMsg = await ChatMessage.findById(systemMsg._id).populate(
      "senderId",
      "fullName name email mobile role"
    );
    getIO().to(roomId).emit("new-message", populatedMsg);
  } catch (socketErr) {
    console.error("❌ Failed to emit status update system message via socket:", socketErr.message);
  }

  // ✅ 🔔 NOTIFY CUSTOMER (ALL STATUS CHANGES)
  try {
    const statusMessageMap = {
      OPEN: "Your support ticket is open",
      ASSIGNED: "Your support ticket has been assigned",
      IN_PROGRESS: "Your support ticket is in progress",
      RESOLVED: "✅ Your issue has been resolved",
      CLOSED: "Your support ticket has been closed",
    };

    const baseMessage =
      statusMessageMap[newStatus] || `Ticket status updated to ${newStatus}`;

    await notifyCustomer({
      customerId: room.customer._id, // IMPORTANT
      type: "TICKET",
      data: { roomId, ticketId: roomId, status: newStatus },
      title: firstCustomerMsg?.message || "Ticket Update",
      message: `${baseMessage} (Ticket ID: ${roomId})`,
    });
  } catch (err) {
    console.error("Customer ticket notification failed:", err?.message);
  }

  // Send SMS when ticket is resolved
  if (newStatus === "RESOLVED" && room.customer?.phoneNumber) {
    try {
      const customerName = room.customer.firstName || "Customer";
      const { ID, MESSAGE } = getResolvedTicketSMSTemplate(
        firstCustomerMsg?.message || "",
        customerName,
        roomId,
      );
      await sendMessage({
        mobile: room.customer.phoneNumber,
        message: MESSAGE,
        template_id: ID,
      });
      console.log(
        `📨 Resolved SMS notification sent to ${room.customer.phoneNumber}`,
      );
    } catch (smsErr) {
      console.error("⚠️ Failed to send Ticket Resolved SMS:", smsErr?.message);
    }
  }

  try {
    const accountId = room.customer?.accountId || null;
    if (accountId) {
      await notifyFranchiseAdmins({
        accountId,
        title: "Ticket Status Updated",
        message: `Ticket ${roomId} status changed to ${newStatus}`,
        data: {
          ticketId: roomId,
          status: newStatus,
          customerId: room.customer?._id?.toString() || null,
          type: "TICKET_STATUS",
        },
      });
    }
  } catch (err) {
    console.error("Franchise ticket notification failed:", err?.message);
  }

  return updatedRoom;
};

/**
 * ===============================
 * ADMIN → ASSIGN STAFF
 * ===============================
 */
export const assignStaffToRoom = async (roomId, staffId) => {
  const room = await ChatRoomRepo.assignStaff(roomId, staffId);

  if (!room) {
    throw new ApiError(404, "Chat room not found");
  }

  return room;
};

/**
 * ===============================
 * FETCH CHAT MESSAGES
 * (Admin / Staff / Customer)
 * ===============================
 */
export const getMessagesByRoom = async (roomId) => {
  const room = await ChatRoomRepo.findById(roomId);

  if (!room) {
    throw new ApiError(404, "Chat room not found");
  }

  const messages = await ChatMsgRepo.getMessagesByRoom(roomId);

  return messages;
};

/**
 * ===============================
 * CHAT PERMISSION CHECK (CORE)
 * ===============================
 *
 * RULES:
 * - CLOSED room → nobody allowed
 * - CUSTOMER → always allowed
 * - ADMIN → always allowed
 * - ADMIN_STAFF → only if assigned
 */
export const canUserSendMessage = async ({
  roomId,
  senderRole,
  senderId,
  accountId,
}) => {
  const room = await ChatRoomRepo.findById(roomId);

  if (!room) {
    throw new ApiError(404, "Chat room not found");
  }

  // 🚫 Closed room
  if (room.status === "CLOSED") {
    throw new ApiError(403, "Chat is closed");
  }

  // ✅ Customer always allowed
  if (senderRole === "CUSTOMER") {
    const roomCustomerId =
      typeof room.customer === "object" && room.customer?._id
        ? room.customer._id.toString()
        : room.customer?.toString();
    if (roomCustomerId !== senderId.toString()) {
      throw new ApiError(403, "You cannot send message in this chat");
    }
    return room;
  }

  // ✅ Franchise admin only for own franchise customer rooms
  if (senderRole === "FRANCHISE_ADMIN") {
    if (!accountId) {
      throw new ApiError(403, "You cannot send message in this chat");
    }
    if (!room.customer || room.customer.accountId !== accountId) {
      throw new ApiError(403, "You cannot send message in this chat");
    }
    return room;
  }

  // ✅ Admin & Staff always allowed (NO assignedStaff check)
  if (
    senderRole === "ADMIN" ||
    senderRole === "SUPER_ADMIN" ||
    senderRole === "ADMIN_STAFF"
  ) {
    return room;
  }

  // ❌ Everything else blocked
  throw new ApiError(403, "You cannot send message in this chat");
};
/**
 * ===============================
 * ADMIN STAFF → FETCH ASSIGNED ROOMS
 * ===============================
 */
export const getRoomsForStaff = async (staffId) => {
  return ChatRoom.find({ assignedStaff: staffId, isConnectedToAgent: true })
    .populate("customer", "firstName lastName emailId userName")
    .sort({ updatedAt: -1 });
};
export const getAssignedRoomsForStaff = async (staffId) => {
  return ChatRoom.find({ assignedStaff: staffId, isConnectedToAgent: true })
    .populate("customer", "firstName lastName emailId userName")
    .sort({ updatedAt: -1 });
};

export const getMyChatRooms = async (customerId) => {
  const rooms = await ChatRoomRepo.findRoomsByCustomer(customerId);

  const roomsWithData = await Promise.all(
    rooms.map(async (room) => {
      const roomData = room.toObject ? room.toObject() : room;

      const firstMsg = await ChatMessage.findOne({
        roomId: room._id,
        senderRole: "CUSTOMER",
      })
        .sort({ createdAt: 1 })
        .select("message")
        .lean();

      return {
        ...roomData,
        Title: firstMsg?.message || null,
      };
    }),
  );

  return roomsWithData;
};

export const connectToAgent = async (req, roomId) => {
  const room = await ChatRoomRepo.findById(roomId);
  if (!room) throw new ApiError(404, "Ticket not found");

  const roomCustomerId =
    typeof room.customer === "object" && room.customer?._id
      ? room.customer._id.toString()
      : room.customer?.toString();

  if (roomCustomerId !== req.user._id.toString()) {
    throw new ApiError(403, "Access denied");
  }

  room.isConnectedToAgent = true;
  await room.save();

  // Log transition
  await createActivityLog({
    req,
    action: "UPDATE",
    module: "TICKET",
    description: "Customer requested to connect to a live agent",
    targetId: roomId,
  });

  // Broadcast Notifications to all agents
  try {
    const customer = await Customer.findById(req.user._id).select(
      "accountId userName",
    );

    await notifyAdmins({
      title: "Live Agent Requested",
      message: `Ticket ${roomId} requested connection by ${customer?.userName || "Customer"}`,
      data: {
        ticketId: roomId,
        status: "OPEN",
        customerId: req.user._id?.toString() || null,
        accountId: customer?.accountId || null,
        type: "LIVE_AGENT_REQUEST",
      },
    });

    if (customer?.accountId) {
      await notifyFranchiseAdmins({
        accountId: customer.accountId,
        title: "Live Agent Requested",
        message: `Ticket ${roomId} requested live agent connection`,
        data: {
          ticketId: roomId,
          status: "OPEN",
          customerId: req.user._id?.toString() || null,
          type: "LIVE_AGENT_REQUEST",
        },
      });
    }
  } catch (err) {
    console.error("Live agent broadcast notification failed:", err.message);
  }

  return room;
};

export const resolveTicketByCustomer = async (req, roomId) => {
  const room = await ChatRoomRepo.findById(roomId);
  if (!room) throw new ApiError(404, "Ticket not found");

  const roomCustomerId =
    typeof room.customer === "object" && room.customer?._id
      ? room.customer._id.toString()
      : room.customer?.toString();

  if (roomCustomerId !== req.user._id.toString()) {
    throw new ApiError(
      403,
      "Access denied: You can only resolve your own tickets",
    );
  }

  const currentStatus = room.status;

  if (currentStatus === "CLOSED") {
    throw new ApiError(400, "Cannot resolve a closed ticket");
  }

  if (currentStatus === "RESOLVED") {
    return room;
  }

  const updatedRoom = await ChatRoomRepo.updateStatus(roomId, "RESOLVED");

  await createActivityLog({
    req,
    action: "UPDATE",
    module: "TICKET",
    description: `Ticket status resolved by customer`,
    targetId: roomId,
    metadata: {
      from: currentStatus,
      to: "RESOLVED",
    },
  });

  const firstCustomerMsg = await ChatMessage.findOne({
    roomId,
    senderRole: "CUSTOMER",
  })
    .sort({ createdAt: 1 })
    .select("message");

  let statusMessage = `Status changed to RESOLVED\nTicket ID: ${roomId}`;

  if (firstCustomerMsg?.message) {
    statusMessage += `\n\nTicket: ${firstCustomerMsg.message}`;
  }

  const systemMsg = await ChatMsgRepo.saveMessage({
    roomId,
    senderId: req.user._id,
    senderModel: "Customer",
    senderRole: "CUSTOMER",
    message: statusMessage,
    messageType: "TEXT",
    statusAtThatTime: "RESOLVED",
  });

  try {
    const populatedMsg = await ChatMessage.findById(systemMsg._id).populate(
      "senderId",
      "fullName name email mobile role"
    );
    getIO().to(roomId).emit("new-message", populatedMsg);
  } catch (socketErr) {
    console.error("❌ Failed to emit customer resolve system message via socket:", socketErr.message);
  }

  await notifyCustomer({
    customerId: room.customer._id,
    type: "TICKET",
    data: { roomId, ticketId: roomId, status: "RESOLVED" },
    title: firstCustomerMsg?.message || "Ticket Update",
    message: `✅ Your issue has been resolved (Ticket ID: ${roomId})`,
  });

  if (room.customer?.phoneNumber) {
    const customerName = room.customer.firstName || "Customer";
    const { ID, MESSAGE } = SMS_TEMPLATE_ID.CLOSE_TICKET_NOTIFICATION(
      customerName,
      roomId,
    );
    await sendMessage({
      mobile: room.customer.phoneNumber,
      message: MESSAGE,
      template_id: ID,
    });
    console.log(
      `📨 Resolved SMS notification sent to ${room.customer.phoneNumber}`,
    );
  }
  return updatedRoom;
};
