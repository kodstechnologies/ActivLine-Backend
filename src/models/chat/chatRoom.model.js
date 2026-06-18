// src/models/chat/chatRoom.model.js
import mongoose from "mongoose";

const chatRoomSchema = new mongoose.Schema(
  {
    _id: String,
   customer: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Customer",
  required: true,
},

    assignedStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin", // ADMIN_STAFF
      default: null,
    },

    assignedFranchiseAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FranchiseAdmin",
      default: null,
    },

    createdByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },

   status: {
  type: String,
  enum: ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  default: "OPEN",
},
lastMessage: {
  type: String,
  default: "",
},

lastMessageAt: {
    type: Date,
    default: null,
  },

  lastOverdueSmsSentAt: {
    type: Date,
    default: null,
  },

  isConnectedToAgent: {
    type: Boolean,
    default: false,
  },

  },
  { timestamps: true }
);


export default mongoose.model("ChatRoom", chatRoomSchema);
