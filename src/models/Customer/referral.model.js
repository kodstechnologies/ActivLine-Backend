import mongoose from "mongoose";

const referralSchema = new mongoose.Schema(
  {
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    referee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      unique: true, // A referee can only be referred once
      index: true,
    },
    codeUsed: {
      type: String,
      required: true,
      trim: true,
    },
    referredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    referralCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

const Referral = mongoose.models.Referral || mongoose.model("Referral", referralSchema);
export default Referral;
