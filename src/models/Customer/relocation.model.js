import mongoose from "mongoose";

const relocationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    accountId: {
      type: String,
      required: true,
      index: true,
    },
    userGroupId: {
      type: String,
      required: true,
    },
    installation_address_line2: {
      type: String,
      required: true,
      trim: true,
    },
    installation_address_city: {
      type: String,
      required: true,
      trim: true,
    },
    installation_address_pin: {
      type: String,
      required: true,
      trim: true,
    },
    installation_address_state: {
      type: String,
      required: true,
      trim: true,
    },
    installation_address_country: {
      type: String,
      required: true,
      default: "India",
      trim: true,
    },
    longitude: {
      type: Number,
      default: null,
    },
    latitude: {
      type: Number,
      default: null,
    },
    sifted_date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["REQUEST", "PENDING", "COMPLETED"],
      default: "REQUEST",
      index: true,
    },
  },
  { timestamps: true }
);

// Create compound index for optimized filtering and sorting
relocationSchema.index({ userId: 1, status: 1 });
relocationSchema.index({ accountId: 1, status: 1 });

const Relocation =
  mongoose.models.Relocation ||
  mongoose.model("Relocation", relocationSchema);

export default Relocation;
