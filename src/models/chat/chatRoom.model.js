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

  },
  { timestamps: true }
);

// 🗑️ CASCADE DELETE: When a room is deleted, delete all its messages & notifications
chatRoomSchema.pre("deleteOne", { document: true, query: true }, async function () {
  try {
    const filter = this.getFilter ? this.getFilter() : null;
    const roomId = filter ? filter._id : this._id;

    if (roomId) {
      // Delete all messages associated with this room
      await mongoose.model("ChatMessage").deleteMany({ roomId });
      // Note: Notifications are also handled in the service, but this is a good backup
    }
  } catch (error) {
    console.error("Cascade delete error:", error);
  }
});

export default mongoose.model("ChatRoom", chatRoomSchema);
