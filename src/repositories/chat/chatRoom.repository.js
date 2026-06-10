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

export const assignStaff = (roomId, staffId) => {
  const update = staffId
    ? { assignedStaff: staffId, status: "ASSIGNED" }
    : { assignedStaff: null, status: "OPEN" };
  return ChatRoom.findByIdAndUpdate(roomId, update, { new: true });
};
export const findByAssignedStaff = (staffId) =>
  ChatRoom.find({ assignedStaff: staffId })
    .populate("customer", "fullName email mobile")
    .sort({ updatedAt: -1 });

export const updateStatus = (roomId, status) =>
  ChatRoom.findByIdAndUpdate(roomId, { status }, { new: true }).populate(
    "customer assignedStaff",
  );
export const updateRoomLastMessage = (roomId, data) =>
  ChatRoom.findByIdAndUpdate(roomId, data, { new: true });

export const findRoomsByCustomer = (customerId) =>
  ChatRoom.find({ customer: customerId })
    .populate("assignedStaff", "name email")
    .sort({ updatedAt: -1 });
