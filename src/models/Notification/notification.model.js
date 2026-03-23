// import mongoose from "mongoose";

// const notificationSchema = new mongoose.Schema({
//   title: { type: String, required: true },
//   message: { type: String },
//   data: { type: Object }, // FULL FORM DATA
//   roles: [{ type: String }], // admin, super_admin, staff
//   isRead: { type: Boolean, default: false }
// }, { timestamps: true });

// export default mongoose.model("Notification", notificationSchema);


// src/models/Notification/notification.model.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    data: {
      type: Object,
      default: {},
    },

    recipientUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },

    recipientRole: {
      type: String,
      enum: ["ADMIN", "SUPER_ADMIN", "ADMIN_STAFF", "FRANCHISE_ADMIN"],
    },

    roles: [{
      type: String,
      enum: ["ADMIN", "SUPER_ADMIN", "ADMIN_STAFF", "FRANCHISE_ADMIN"],
    }],

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Notification", notificationSchema);
