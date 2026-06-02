import mongoose from "mongoose";

const franchiseSchema = new mongoose.Schema(
  {
    accountId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    accountName: {
      type: String,
      required: true,
    },
    apiKey: {
      type: String,
      required: true,
    },
    companyName: {
      type: String,
      required: true,
    },
    parentAccountId: {
      type: String,
      default: null,
    },
    dateCreated: {
      type: Date,
    },
    franchise_availavility: {
      startTime: {
        type: String,
        default: "09:00 AM",
      },
      endTime: {
        type: String,
        default: "09:00 PM",
      },
    },
  },
  { timestamps: true },
);

// 🔥 FIX
const Franchise =
  mongoose.models.Franchise || mongoose.model("Franchise", franchiseSchema);

export default Franchise;
