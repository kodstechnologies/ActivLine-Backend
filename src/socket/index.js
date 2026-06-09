import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import ChatRoom from "../models/chat/chatRoom.model.js";

import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";
import ChatMessage from "../models/chat/chatMessage.model.js";
import { canUserSendMessage } from "../services/chat/chat.service.js";
// import fs from "fs";
// import path from "path";

let io;
let isInitialized = false;

/* ===============================
   🗂️ CONNECTED USERS REGISTRY
   Tracks online sockets by userId so we can
   target ADMIN / FRANCHISE_ADMIN for customer-care alerts.
   Structure: Map<userId_string, Set<socketId_string>>
   =============================== */
const connectedUsers = new Map();

export const initSocket = (server) => {
  if (io) {
    // Prevent duplicate Socket.IO instances in the same process
    return io;
  }
  if (!server) {
    throw new Error("Socket.io init requires a valid HTTP server");
  }
  /* ===============================
     🌐 ALLOWED ORIGINS
     =============================== */
  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:64255",
    "http://15.206.235.221",
  ];

  if (process.env.CORS_ORIGIN) {
    allowedOrigins.push(
      ...process.env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    );
  }

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || origin === "null") return callback(null, true);
        if (
          allowedOrigins.includes(origin) ||
          origin.startsWith("http://localhost") ||
          origin.startsWith("http://127.0.0.1")
        ) {
          return callback(null, true);
        }
        return callback(new Error("Not allowed by Socket.IO CORS"));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket"],
    maxHttpBufferSize: 20 * 1024 * 1024, // 🔥 20MB REQUIRED
  });

  /* ===============================
     🔐 SOCKET JWT AUTH (MANDATORY)
     =============================== */
  io.use((socket, next) => {
    try {
      let token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "") ||
        socket.handshake.query?.token;

      if (!token) {
        console.error(
          `❌ Socket Connection Rejected: No token provided (ID: ${socket.id})`,
        );
        return next(new Error("Socket auth token missing"));
      }

      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

      socket.user = {
        _id: decoded._id,
        role: (decoded.role || "CUSTOMER").toUpperCase(),
        email: decoded.email || null,
        accountId: decoded.accountId || null,
      };

      next();
    } catch (err) {
      console.error(
        `❌ Socket Connection Rejected: Invalid token (ID: ${socket.id}) - ${err.message}`,
      );
      return next(new Error("Invalid socket token"));
    }
  });

  /* ===============================
     🔌 SOCKET CONNECTION
     =============================== */
  io.on("connection", (socket) => {
    console.log("🟢 Socket connected:", socket.id, "| ROLE:", socket.user.role);

    /* -------- REGISTER IN CONNECTED USERS MAP -------- */
    const uid = String(socket.user._id);
    if (!connectedUsers.has(uid)) connectedUsers.set(uid, new Set());
    connectedUsers.get(uid).add(socket.id);

    /* -------- PRIVATE USER ROOM JOIN -------- */
    socket.join(`user-${uid}`);
    console.log(`👤 Socket ${socket.id} joined private room: user-${uid}`);

    /* -------- GLOBAL ROOM JOINS -------- */
    const role = socket.user.role;
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      socket.join("admins");
      console.log(`👤 Socket ${socket.id} joined global room: admins`);
    } else if (role === "FRANCHISE_ADMIN") {
      if (socket.user.accountId) {
        socket.join(`franchise-${socket.user.accountId}`);
        console.log(`👤 Socket ${socket.id} joined global room: franchise-${socket.user.accountId}`);
      }
    }

    /* -------- JOIN ROOM -------- */
    socket.on("join-room", (roomId) => {
      if (!roomId) return;
      socket.join(roomId);
      console.log("📦 Joined room:", roomId);
    });

    /* ===============================
       💬 SEND MESSAGE (ADMIN/CUSTOMER)
       =============================== */

    socket.on(
      "send-message",
      async ({ roomId, message = "", attachments = [] }) => {
        try {
          console.log("chat data", roomId, message, attachments);
          if (!roomId) return;
          if (!message?.trim() && attachments.length === 0) return;

          const room = await ChatRoom.findById(roomId).populate("customer", "accountId").populate("assignedStaff", "_id");
          if (!room) throw new Error("Chat room not found");

          /* ===============================
       DETERMINE SENDER MODEL
    =============================== */

          const senderModel =
            socket.user.role === "CUSTOMER"
              ? "Customer"
              : socket.user.role === "FRANCHISE_ADMIN"
                ? "FranchiseAdmin"
                : "Admin";

          /* ===============================
       UPLOAD ATTACHMENTS
    =============================== */

          const uploadedAttachments = [];

          for (const file of attachments) {
            if (!file.buffer || file.buffer.length === 0) {
              throw new Error("Received empty file buffer");
            }

            const uploaded = await uploadToCloudinary({
              buffer: Buffer.from(file.buffer),
              mimetype: file.type || "application/octet-stream",
              originalname: file.name,
            });

            uploadedAttachments.push({
              name: file.name,
              url: uploaded.secure_url,
              size: uploaded.bytes,
              mimeType: file.type,
              extension: file.name.split(".").pop().toLowerCase(),
              type: file.type?.startsWith("image") ? "image" : "file",
            });
          }

          /* ===============================
       DETERMINE MESSAGE TYPE
    =============================== */

          let messageType = "TEXT";

          if (uploadedAttachments.length > 0) {
            const hasImage = uploadedAttachments.some(
              (a) => a.type === "image",
            );
            messageType = hasImage ? "IMAGE" : "FILE";
          }

          /* ===============================
       SAVE MESSAGE
    =============================== */

          const msg = await ChatMessage.create({
            roomId,
            senderId: socket.user._id,
            senderRole: socket.user.role,
            senderModel,
            message: message || "",
            statusAtThatTime: room.status,
            messageType,
            attachments: uploadedAttachments,
          });

          /* ===============================
       POPULATE & EMIT MESSAGE TO ROOM
    =============================== */

          const populatedMsg = await ChatMessage.findById(msg._id).populate(
            "senderId",
            "name fullName email mobile role",
          );

          // The populated message is sent so client has all details,
          // which is consistent with HTTP responses.
          io.to(roomId).emit("new-message", populatedMsg);

          // Broadcast message globally for sidebar updates
          if (room.assignedStaff && room.assignedStaff._id) {
            io.to(`user-${room.assignedStaff._id}`).emit("global-new-message", { roomId, message: populatedMsg });
          } else {
            io.to("admins").emit("global-new-message", { roomId, message: populatedMsg });
            if (room.customer && room.customer.accountId) {
              io.to(`franchise-${room.customer.accountId}`).emit("global-new-message", { roomId, message: populatedMsg });
            }
          }

          /* ===============================
       UPDATE ROOM LAST MESSAGE
    =============================== */

          const lastMessage = message?.trim()
            ? message
            : uploadedAttachments.length > 0
              ? uploadedAttachments[0].type === "image"
                ? "📷 Image"
                : "📎 File"
              : "";

          await ChatRoom.findByIdAndUpdate(roomId, {
            lastMessage,
            lastMessageAt: new Date(),
          });
        } catch (err) {
          console.error("❌ Socket Send Message Error:", err);

          socket.emit("send-error", {
            message: err.message || "Failed to send message",
          });
        }
      },
    );

    /* ===============================
       📞 CALL CUSTOMER CARE
       Emitted by: CUSTOMER (or any authenticated socket)
       - Outside 9AM–9PM  → emits "no_customer_care" back to caller only
       - Inside  9AM–9PM  → emits "customer_care_request" to every
         connected ADMIN, SUPER_ADMIN, and FRANCHISE_ADMIN socket
       Timezone: IST (Asia/Kolkata) — adjust CUSTOMER_CARE_TZ env var if needed
       =============================== */
    socket.on("call_customer_care", (data = {}) => {
      try {
        /* ---- 1. Determine current hour in the configured timezone ---- */
        const tz = process.env.CUSTOMER_CARE_TZ || "Asia/Kolkata";
        const nowInTZ = new Date().toLocaleString("en-US", { timeZone: tz });
        const currentHour = new Date(nowInTZ).getHours(); // 0–23

        const OPEN_HOUR = 9; // 9:00 AM  (inclusive)
        const CLOSE_HOUR = 21; // 9:00 PM  (exclusive)

        /* ---- 2. Outside business hours → reject ---- */
        if (currentHour < OPEN_HOUR || currentHour >= CLOSE_HOUR) {
          console.log(
            `📞 call_customer_care: outside hours (${currentHour}:xx ${tz}) — caller: ${socket.id}`,
          );
          socket.emit("no_customer_care", {
            success: false,
            message:
              "Customer care is available between 9 AM and 9 PM. Please try again during business hours.",
            currentHour,
            timezone: tz,
          });
          return;
        }

        /* ---- 3. Within hours → build notification payload ---- */
        const ADMIN_ROLES = new Set([
          "ADMIN",
          "SUPER_ADMIN",
          "FRANCHISE_ADMIN",
        ]);

        const payload = {
          success: true,
          callerId: socket.user._id,
          callerRole: socket.user.role,
          callerEmail: socket.user.email,
          message: "A customer is requesting customer care support.",
          timestamp: new Date().toISOString(),
          ...(data && typeof data === "object" ? { meta: data } : {}),
        };

        /* ---- 4. Emit to every live ADMIN / FRANCHISE_ADMIN socket ---- */
        let notified = 0;
        io.sockets.sockets.forEach((targetSocket) => {
          if (
            targetSocket.id !== socket.id && // not the caller themselves
            ADMIN_ROLES.has(targetSocket.user?.role) // only admin-side roles
          ) {
            targetSocket.emit("customer_care_request", payload);
            notified++;
          }
        });

        console.log(
          `📞 call_customer_care: notified ${notified} admin/franchise socket(s) — caller: ${socket.id} [${socket.user.role}]`,
        );

        /* ---- 5. Acknowledge the caller that the request was dispatched ---- */
        socket.emit("customer_care_request_sent", {
          success: true,
          message:
            "Your request has been sent to our support team. Someone will be with you shortly.",
          notifiedCount: notified,
          timestamp: payload.timestamp,
        });
      } catch (err) {
        console.error("❌ call_customer_care error:", err);
        socket.emit("no_customer_care", {
          success: false,
          message:
            "Something went wrong while connecting to customer care. Please try again.",
        });
      }
    });

    socket.on("disconnect", () => {
      /* ---- Clean up connectedUsers registry ---- */
      const uid = String(socket.user._id);
      if (connectedUsers.has(uid)) {
        connectedUsers.get(uid).delete(socket.id);
        if (connectedUsers.get(uid).size === 0) connectedUsers.delete(uid);
      }
      console.log("🔴 Socket disconnected:", socket.id);
    });
  });

  isInitialized = true;
  return io;
};

export const getIO = () => {
  if (!io || !isInitialized) throw new Error("Socket.io not initialized");
  return io;
};
