// src/controllers/chat/chat.admin.controller.js
import * as ChatService from "../../services/chat/chat.service.js";
import * as ChatRoomRepo from "../../repositories/chat/chatRoom.repository.js";
import ApiResponse from "../../utils/ApiReponse.js";
import { asyncHandler } from "../../utils/AsyncHandler.js";
import { createActivityLog } from "../../services/ActivityLog/activityLog.service.js";
import { assignStaffSchema,updateTicketStatusSchema } from "../../validations/chat/chat.validation.js";
import { notifyStaffOnTicketAssign } from "../../services/Notification/staff.notification.service.js";
export const assignStaff = asyncHandler(async (req, res) => {
  const { error } = assignStaffSchema.validate(req.body);
  if (error) throw error;

  const room = await ChatService.assignStaffToRoom(
    req.body.roomId,
    req.body.staffId
  );
 await createActivityLog({
    req,
    action: "UPDATE",
    module: "CHAT",
    description: "Admin assigned staff to chat room",
    targetId: room._id,
    metadata: {
      staffId: req.body.staffId,
    },
  });
    // 🔔 SEND STAFF NOTIFICATION
  await notifyStaffOnTicketAssign({
    staffId: req.body.staffId,
    room,
    assignedBy: req.user,
  });
  res.json(ApiResponse.success(room, "Staff assigned successfully"));
});

export const getAllRooms = asyncHandler(async (req, res) => {
  const { status } = req.query;

  const rooms = await ChatService.getAllRooms({ status });

  res.json(
    ApiResponse.success(rooms, "Chat rooms fetched successfully")
  );
});




export const getRoomMessages = asyncHandler(async (req, res) => {
  const { roomId } = req.params;

  const room = await ChatRoomRepo.findById(roomId);
  if (!room) {
    return res.status(404).json(
      ApiResponse.error("Room not found")
    );
  }

  const messages = await ChatService.getMessagesByRoom(roomId);

  res.json(
    ApiResponse.success(messages, "Chat messages fetched successfully")
  );
});


export const updateTicketStatus = asyncHandler(async (req, res) => {
  const { error } = updateTicketStatusSchema.validate(req.body);
  if (error) throw error;

  const updatedRoom = await ChatService.updateTicketStatus(req, req.body.roomId, req.body.status);
await createActivityLog({
  req,
  action: "UPDATE",
  module: "TICKET",
  description: updatedRoom.deleted
    ? "Ticket closed and deleted"
    : `Ticket status changed to ${req.body.status}`,
  targetId: updatedRoom._id,
});

  res.json(
    ApiResponse.success(
      updatedRoom,
      updatedRoom.deleted
        ? "Ticket closed and full chat history deleted"
        : `Ticket status updated to ${req.body.status}`
    )
  );
});
