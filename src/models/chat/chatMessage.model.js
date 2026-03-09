// // src/models/chat/chatMessage.model.js
// import mongoose from "mongoose";

// const chatMessageSchema = new mongoose.Schema(
//   {
//     roomId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "ChatRoom",
//       required: true,
//     },

//     senderId: {
//       type: mongoose.Schema.Types.ObjectId,
//       required: true,
//       refPath: "senderModel",
//     },

//     senderModel: {
//       type: String,
//       required: true,
//       enum: ["Customer", "Admin"],
//     },

//     senderRole: {
//       type: String,
//       enum: ["CUSTOMER", "ADMIN", "ADMIN_STAFF"],
//       required: true,
//     },

//     message: {
//       type: String,
//       required: true,
//     },

//     isRead: {
//       type: Boolean,
//       default: false,
//     },
//   },
//   { timestamps: true }
// );

// export default mongoose.model("ChatMessage", chatMessageSchema);


// src/models/chat/chatMessage.model.js
import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true
    },

    // 🔑 UI helper only
    type: {
      type: String,
      enum: ["image", "file"],
      required: true
    },

    name: {
      type: String,
      required: true
    },

    size: {
      type: Number,
      required: true
    },

    // 🔥 VERY IMPORTANT (for correct download)
    mimeType: {
      type: String,        // application/pdf, application/msword
      required: true
    },

    extension: {
      type: String,        // pdf, docx, xlsx
      required: true
    }
  },
  { _id: false }
);

const chatMessageSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      ref: "ChatRoom",
      required: true,
    },

    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "senderModel",
    },

    senderModel: {
      type: String,
      enum: ["Customer", "Admin"],
      required: true,
    },

    senderRole: {
      type: String,
      enum: ["CUSTOMER", "ADMIN", "ADMIN_STAFF", "SUPER_ADMIN", "FRANCHISE_ADMIN"],
      required: true,
    },

     statusAtThatTime: {
  type: String,
  enum: ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  required: true,
},
    messageType: {
      type: String,
      enum: ["TEXT", "IMAGE", "FILE"],
      default: "TEXT",
    },

    message: {
      type: String,
      default: "",
    },

    attachments: [attachmentSchema], // ✅ IMPORTANT

    tempId: {
      type: String,
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
   

  },
  { timestamps: true }
);

export default mongoose.model("ChatMessage", chatMessageSchema);
