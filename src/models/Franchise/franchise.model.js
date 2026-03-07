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
  },
  { timestamps: true }
);

// 🔥 FIX
const Franchise =
  mongoose.models.Franchise ||
  mongoose.model("Franchise", franchiseSchema);

export default Franchise;