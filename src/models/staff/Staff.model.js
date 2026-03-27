import mongoose from "mongoose";

const staffStatusSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "DISABLED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

export default mongoose.model("StaffStatus", staffStatusSchema);
