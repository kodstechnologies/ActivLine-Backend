import mongoose from "mongoose";

const dailyDataUsageSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    date: {
      type: String, // format "YYYY-MM-DD"
      required: true,
    },
    cumulativeVolumeGB: {
      type: Number,
      required: true,
    },
    dailyVolumeGB: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate logs for the same user on the same calendar day
dailyDataUsageSchema.index({ customer: 1, date: 1 }, { unique: true });

export default mongoose.model("DailyDataUsage", dailyDataUsageSchema);
