import mongoose from "mongoose";

const companyProfileSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    ownerRole: {
      type: String,
      required: true,
      enum: ["SUPER_ADMIN", "ADMIN", "ADMIN_STAFF", "FRANCHISE_ADMIN", "STAFF"],
      index: true,
    },
    companyName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    address: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

companyProfileSchema.index({ ownerId: 1, ownerRole: 1 }, { unique: true });

const CompanyProfile =
  mongoose.models.CompanyProfile ||
  mongoose.model("CompanyProfile", companyProfileSchema);

export default CompanyProfile;
