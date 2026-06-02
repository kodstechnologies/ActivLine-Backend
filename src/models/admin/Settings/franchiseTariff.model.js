import mongoose from "mongoose";

const franchiseTariffSchema = new mongoose.Schema(
  {
    franchiseId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tariffType: {
      type: String,
      required: true,
      enum: ["FIXED", "PERCENTAGE"],
      default: "FIXED",
    },
    tariffValue: {
      type: Number,
      required: true,
      min: [0, "Tariff value cannot be negative"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true }
);

const FranchiseTariff =
  mongoose.models.FranchiseTariff ||
  mongoose.model("FranchiseTariff", franchiseTariffSchema);

export default FranchiseTariff;
