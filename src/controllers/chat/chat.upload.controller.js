// controllers/chat/chat.upload.controller.js
// multer-s3 streams files directly to S3 — no manual upload needed here.
import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import { chatUpload } from "../../middlewares/upload.middleware.js";
import ChatMessage from "../../models/chat/chatMessage.model.js";
import { getIO } from "../../socket/index.js";
import ChatRoom from "../../models/chat/chatRoom.model.js";
import * as ChatService from "../../services/chat/chat.service.js";

export const uploadChatFiles = asyncHandler(async (req, res) => {
  // 1️⃣ Handle Multipart Upload — multer-s3 streams directly to S3
  await new Promise((resolve, reject) => {
    chatUpload.array("files", 5)(req, res, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  // 2️⃣ Process Files & Message
  const { roomId, message: textMessage } = req.body;

  if (!roomId) {
    return res.status(400).json(ApiResponse.error("Room ID is required"));
  }

  const room = await ChatRoom.findById(roomId);
  if (!room) {
    return res.status(404).json(ApiResponse.error("Chat room not found"));
  }

  await ChatService.canUserSendMessage({
    roomId,
    senderRole: req.user.role,
    senderId: req.user._id,
    accountId: req.user.accountId,
  });

  // 3️⃣ Build attachments from multer-s3 result
  // file.location = S3 public URL, file.key = S3 key, file.size = bytes
  const attachments = [];

  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      attachments.push({
        url: file.location,                                       // ✅ S3 URL (direct)
        name: file.originalname,
        size: file.size,                                          // ✅ actual size in bytes
        mimeType: file.mimetype,
        extension: file.originalname.split(".").pop().toLowerCase(),
        type: file.mimetype.startsWith("image/") ? "image" : "file",
      });
    }
  }

  if (attachments.length === 0 && (!textMessage || !textMessage.trim())) {
    return res.status(400).json(ApiResponse.error("Message or files required"));
  }

  // 4️⃣ CREATE CHAT MESSAGE
  const senderModel =
    req.user.role === "CUSTOMER"
      ? "Customer"
      : req.user.role === "FRANCHISE_ADMIN"
        ? "FranchiseAdmin"
        : "Admin";

  const message = await ChatMessage.create({
    roomId,
    senderId: req.user._id,
    senderRole: req.user.role,
    senderModel,
    message: textMessage || "",
    messageType:
      attachments.length > 0
        ? attachments.some((a) => a.type === "image")
          ? "IMAGE"
          : "FILE"
        : "TEXT",
    attachments,
    tempId: req.body.tempId || null,
    statusAtThatTime: room.status,
  });

  const populated = await ChatMessage.findById(message._id).populate(
    "senderId",
    "fullName email role"
  );

  // 5️⃣ EMIT SOCKET
  getIO().to(roomId).emit("new-message", populated);

  res.json(ApiResponse.success(populated, "Message sent successfully"));
});
