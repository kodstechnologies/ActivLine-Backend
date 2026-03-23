// src/services/chat/chat.service.js

import * as ChatRoomRepo from "../../repositories/chat/chatRoom.repository.js";
import * as ChatMsgRepo from "../../repositories/chat/chatMessage.repository.js";
import ChatMessage from "../../models/chat/chatMessage.model.js";
import ChatRoom from "../../models/chat/chatRoom.model.js";
import { createActivityLog } from "../ActivityLog/activityLog.service.js";
import ApiError from "../../utils/ApiError.js";
import crypto from "crypto";
import { notifyCustomer } from "../Notification/customer.notification.service.js";
import CustomerNotification from "../../models/Notification/customernotification.model.js";
import Notification from "../../models/Notification/notification.model.js";
import { notifyFranchiseAdmins } from "../Notification/franchise.notification.service.js";
/**
 * ===============================
 * ADMIN → FETCH ALL ROOMS
 * ===============================
 */


export const getAllRooms = async ({ status }) => {
  const filter = {};

  // ✅ Apply filter ONLY when valid
  if (status && ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)) {
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
  const { message } = req.body;

  // ✅ Generate 10-digit numeric ID
  const roomId = crypto.randomInt(1000000000, 10000000000).toString();

  // ✅ ALWAYS CREATE NEW ROOM (no reuse)
  const room = await ChatRoomRepo.createRoom({
    _id: roomId,
    customer: customerId,
    status: "OPEN",
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
  const defaultMessage = "What can I Help you";
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

    await ChatRoomRepo.updateRoomLastMessage(room._id, {
      lastMessage: message.trim(),
      lastMessageAt: new Date(),
    });
  }

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
      `Invalid status change from ${currentStatus} to ${newStatus}`
    );
  }

  if (
    ["IN_PROGRESS", "RESOLVED", "CLOSED"].includes(newStatus) &&
    !["ADMIN", "SUPER_ADMIN", "ADMIN_STAFF", "FRANCHISE_ADMIN"].includes(userRole)
  ) {
    throw new ApiError(403, "You are not allowed to update ticket status");
  }

  // 🔐 FRANCHISE ADMIN CHECK: Can only manage own franchise tickets
  if (userRole === "FRANCHISE_ADMIN") {
    if (!room.customer || room.customer.accountId !== req.user.accountId) {
      throw new ApiError(403, "Access denied: You can only manage tickets for your franchise");
    }
  }

  // CLOSE => delete room + full chat history + room-linked notifications
  if (newStatus === "CLOSED") {
    await createActivityLog({
      req,
      action: "UPDATE",
      module: "TICKET",
      description: `Ticket status changed from ${currentStatus} to CLOSED`,
      targetId: roomId,
      metadata: {
        from: currentStatus,
        to: "CLOSED",
      },
    });

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
            type: "TICKET_STATUS",
          },
        });
      }
    } catch (err) {
      console.error("Franchise ticket notification failed:", err?.message);
    }

    await Promise.all([
      ChatMessage.deleteMany({ roomId }),
      ChatRoom.deleteOne({ _id: roomId }),
      CustomerNotification.deleteMany({ "data.roomId": roomId }),
      Notification.deleteMany({ "data.roomId": roomId }),
    ]);

    return {
      _id: roomId,
      status: "CLOSED",
      deleted: true,
    };
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

  let statusMessage = `Status changed to ${newStatus}`;

  if (firstCustomerMsg?.message) {
    statusMessage += `\n\nTicket: ${firstCustomerMsg.message}`;
  }

  await ChatMsgRepo.saveMessage({
    roomId,
    senderId: req.user._id,
    senderModel: req.user.role === "FRANCHISE_ADMIN" ? "FranchiseAdmin" : "Admin",
    senderRole: req.user.role,
    message: statusMessage,
    messageType: "TEXT",
    statusAtThatTime: newStatus,
  });

  // ✅ 🔔 NOTIFY CUSTOMER
  if (newStatus === "RESOLVED") {
    await notifyCustomer({
      customerId: room.customer._id, // IMPORTANT
      type: "TICKET",
      data: { roomId },
      title: firstCustomerMsg?.message || "",
      message: "✅ Your issue has been resolved",
    });
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
  return ChatRoom.find({ assignedStaff: staffId })
    .populate("customer", "firstName lastName emailId userName")
    .sort({ updatedAt: -1 });
};
export const getAssignedRoomsForStaff = async (staffId) => {
  return ChatRoom.find({ assignedStaff: staffId })
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
    })
  );

  return roomsWithData;
};
