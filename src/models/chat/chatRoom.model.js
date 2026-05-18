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

  // Set when status transitions to CLOSED.
  // Used by the daily cleanup job to delete rooms older than 90 days.
  closedAt: {
    type: Date,
    default: null,
    index: true,   // sparse index → fast range query in cron
  },

  },
  { timestamps: true }
);

// 🗑️ CASCADE DELETE SAFETY-NET
// This hook fires ONLY when ChatRoom.deleteOne() / deleteMany() is called directly
// (e.g. by the 90-day cleanup cron job).
// It does NOT fire during a normal CLOSED status update — the room is soft-closed instead.
chatRoomSchema.pre("deleteOne", { document: true, query: true }, async function () {
  try {
    const filter = this.getFilter ? this.getFilter() : null;
    const roomId = filter ? filter._id : this._id;
    if (roomId) {
      await mongoose.model("ChatMessage").deleteMany({ roomId });
    }
  } catch (error) {
    console.error("Cascade delete error:", error);
  }
});

export default mongoose.model("ChatRoom", chatRoomSchema);
