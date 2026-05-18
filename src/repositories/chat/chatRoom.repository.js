// src/repositories/chat/chatRoom.repository.js
import ChatRoom from "../../models/chat/chatRoom.model.js";


export const getAll = (filter = {}) =>
  ChatRoom.find(filter)
    .populate("customer", "fullName email mobile userName phoneNumber emailId")
    .populate("assignedStaff", "name email")
    .sort({ updatedAt: -1 });


export const createRoom = (data) => ChatRoom.create(data);

export const findByCustomer = (customerId) =>
  ChatRoom.findOne({ customer: customerId });

export const findById = (id) =>
  ChatRoom.findById(id).populate("assignedStaff customer");

export const assignStaff = (roomId, staffId) =>
  ChatRoom.findByIdAndUpdate(
    roomId,
    { assignedStaff: staffId, status: "ASSIGNED" },
    { new: true }
  );
export const findByAssignedStaff = (staffId) =>
  ChatRoom.find({ assignedStaff: staffId })
    .populate("customer", "fullName email mobile")
    .sort({ updatedAt: -1 });

    
    export const updateStatus = (roomId, status) =>
  ChatRoom.findByIdAndUpdate(
    roomId,
    { status },
    { new: true }
  ).populate("customer assignedStaff");
export const updateRoomLastMessage = (roomId, data) =>
  ChatRoom.findByIdAndUpdate(roomId, data, { new: true });

export const findRoomsByCustomer = (customerId) =>
  ChatRoom.find({ customer: customerId })
    .populate("assignedStaff", "name email")
    .sort({ updatedAt: -1 });

// ─── CLOSE (soft) ──────────────────────────────────────────────────────────
// Only used by the CLOSED status transition. Sets closedAt for the cron job.
export const closeRoom = (roomId) =>
  ChatRoom.findByIdAndUpdate(
    roomId,
    { status: "CLOSED", closedAt: new Date() },
    { new: true }
  ).populate("customer assignedStaff");

// ─── CRON QUERY ────────────────────────────────────────────────────────────
// Returns minimal projection — only _id needed for batch deletion.
export const findExpiredClosedRooms = (cutoffDate) =>
  ChatRoom.find(
    { status: "CLOSED", closedAt: { $lte: cutoffDate } },
    { _id: 1 }          // lean projection — no population needed
  ).lean();
