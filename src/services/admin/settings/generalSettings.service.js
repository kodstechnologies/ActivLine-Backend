// services/generalSettings.service.js
import fs from "fs";
import cloudinary from "../../../utils/cloudinary.js";
import Banner from "../../../models/admin/Settings/banner.model.js";
import GeneralSettings from "../../../models/admin/Settings/generalSettings.model.js";
import { ApiError } from "../../../utils/ApiError.js";

// ── General Settings ──────────────────────────────────────────────────────────

export const getGeneralSettingsService = async () => {
  let settings = await GeneralSettings.findOne();

  if (!settings) {
    settings = await GeneralSettings.create({
      companyName: "ActivLine Internet",
      supportEmail: "support@activline.in",
      address: "Not configured",
    });
  }

  return settings;
};

export const updateGeneralSettingsService = async (data, adminId) => {
  const settings = await GeneralSettings.findOneAndUpdate(
    {},
    { ...data, updatedBy: adminId },
    { new: true, upsert: true }
  );
  return settings;
};

// ── Cloudinary helpers ────────────────────────────────────────────────────────

/**
 * Upload banner via disk path (multer diskStorage → req.file.path).
 * Uses resource_type:"auto" so Cloudinary handles images AND videos correctly.
 * Deletes the local temp file after upload regardless of success/failure.
 */
const uploadBannerToCloudinary = async (file) => {
  const localPath = file.path;

  try {
    const sanitizedName = file.originalname
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]/g, "_");

    const result = await cloudinary.uploader.upload(localPath, {
      folder: "activline/banners",
      resource_type: "auto",          // ✅ auto-detects image OR video
      public_id: `${Date.now()}-${sanitizedName}`,
      use_filename: true,
      unique_filename: true,
    });

    return result;
  } finally {
    // Always clean up temp file from disk — never leave orphaned files
    fs.unlink(localPath, (err) => {
      if (err) console.warn("⚠️  Could not delete temp file:", localPath, err.message);
    });
  }
};

/**
 * Delete a banner from Cloudinary by stored public_id + resource_type.
 * Non-fatal — logs warning but never blocks DB operations.
 */
const deleteBannerFromCloudinary = async (publicId, resourceType = "image") => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error("⚠️  Cloudinary delete failed (continuing):", err?.message);
  }
};

// ── Banner CRUD ───────────────────────────────────────────────────────────────

/**
 * GET — return the banner document; auto-creates an empty one on first call.
 */
export const getAllBannersService = async () => {
  let doc = await Banner.findOne();
  if (!doc) {
    doc = await Banner.create({ banners: [] });
  }
  return doc;
};

/**
 * CREATE — upload to Cloudinary via disk path, push new item into banners[].
 */
export const createBannerService = async (file) => {
  const uploaded = await uploadBannerToCloudinary(file);

  if (!uploaded?.secure_url) {
    throw new ApiError(500, "Cloudinary upload failed — no URL returned");
  }

  const fileType = file.mimetype?.startsWith("image/") ? "image" : "video";

  const doc = await Banner.findOneAndUpdate(
    {},
    {
      $push: {
        banners: {
          file_type: fileType,
          url: uploaded.secure_url,
          cloudinary_public_id: uploaded.public_id,
          isActive: true,
        },
      },
    },
    { upsert: true, new: true }
  );

  // Return only the newly added item
  return doc.banners[doc.banners.length - 1];
};

/**
 * UPDATE — replace an existing banner's file.
 * 1. Upload new file first (so we never lose the old URL if upload fails).
 * 2. Delete old Cloudinary resource (best-effort).
 * 3. Update DB.
 */
export const updateBannerService = async (bannerId, file) => {
  const doc = await Banner.findOne({ "banners._id": bannerId });
  if (!doc) throw new ApiError(404, "Banner not found");

  const existingItem = doc.banners.id(bannerId);

  // 1. Upload new file
  const uploaded = await uploadBannerToCloudinary(file);
  if (!uploaded?.secure_url) {
    throw new ApiError(500, "Cloudinary upload failed — no URL returned");
  }

  const fileType = file.mimetype?.startsWith("image/") ? "image" : "video";

  // 2. Delete old Cloudinary resource
  const oldResourceType = existingItem.file_type === "video" ? "video" : "image";
  await deleteBannerFromCloudinary(existingItem.cloudinary_public_id, oldResourceType);

  // 3. Update subdocument
  existingItem.file_type = fileType;
  existingItem.url = uploaded.secure_url;
  existingItem.cloudinary_public_id = uploaded.public_id;

  await doc.save();
  return existingItem;
};

/**
 * TOGGLE isActive — flip active state without deleting.
 */
export const toggleBannerService = async (bannerId) => {
  const doc = await Banner.findOne({ "banners._id": bannerId });
  if (!doc) throw new ApiError(404, "Banner not found");

  const item = doc.banners.id(bannerId);
  item.isActive = !item.isActive;
  await doc.save();
  return item;
};

/**
 * DELETE — remove from Cloudinary then pull from banners[].
 */
export const deleteBannerService = async (bannerId) => {
  const doc = await Banner.findOne({ "banners._id": bannerId });
  if (!doc) throw new ApiError(404, "Banner not found");

  const item = doc.banners.id(bannerId);
  const resourceType = item.file_type === "video" ? "video" : "image";

  await deleteBannerFromCloudinary(item.cloudinary_public_id, resourceType);

  doc.banners.pull({ _id: bannerId });
  await doc.save();

  return { deletedId: bannerId };
};
