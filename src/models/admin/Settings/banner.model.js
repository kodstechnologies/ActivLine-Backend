import mongoose from "mongoose";

// ── Each banner item (image OR video) ────────────────────────────────────────
const bannerItemSchema = new mongoose.Schema(
  {
    file_type: {
      type: String,
      enum: ["image", "video"],
      required: [true, "File type is required"],
    },
    url: {
      type: String,
      required: [true, "Banner URL is required"],
    },
    // Stored so we can delete the old file from Cloudinary on update / delete
    cloudinary_public_id: {
      type: String,
      default: null,
    },
    // Lets you toggle a banner without fully removing it
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: true,        // each banner item gets its own _id for individual update / delete
    timestamps: true, // createdAt + updatedAt per banner item
  }
);

// ── Root document — holds the banners array ───────────────────────────────────
const bannerSchema = new mongoose.Schema(
  {
    banners: [bannerItemSchema],
  },
  { timestamps: true }
);

export default mongoose.model("Banner", bannerSchema);
