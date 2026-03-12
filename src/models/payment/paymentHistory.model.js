import mongoose from "mongoose";

const paymentHistorySchema = new mongoose.Schema(
  {
    groupId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    accountId: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },
    profileId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    planName: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    planAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
      index: true,
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    razorpayPaymentId: {
      type: String,
      index: true,
      trim: true,
      default: null,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    planDetails: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

paymentHistorySchema.index({ groupId: 1, createdAt: -1 });
paymentHistorySchema.index({ groupId: 1, planName: 1 });
paymentHistorySchema.index({ accountId: 1, createdAt: -1 });
paymentHistorySchema.index({ createdAt: -1 });

const PaymentHistory =
  mongoose.models.PaymentHistory ||
  mongoose.model("PaymentHistory", paymentHistorySchema);

export default PaymentHistory;
