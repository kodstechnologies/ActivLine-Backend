import mongoose from "mongoose";

const ottTransactionSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    franchiseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Franchise",
      required: true,
      index: true,
    },
    playboxTransactionId: {
      type: String,
      required: true,
      unique: true,
    },
    packCode: {
      type: String,
      required: true,
    },
    packName: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "CANCELLED", "FAILED"],
      default: "ACTIVE",
    },
    validityDays: {
      type: Number,
      required: true,
    },
    startAt: {
      type: Date,
      required: true,
    },
    expiryAt: {
      type: Date,
      required: true,
    },
    otts: [
      {
        ottId: String,
        ottName: String,
        consumed: Boolean,
        key: String,
      },
    ],
  },
  { timestamps: true }
);

const OttTransaction =
  mongoose.models.OttTransaction ||
  mongoose.model("OttTransaction", ottTransactionSchema);

export default OttTransaction;
