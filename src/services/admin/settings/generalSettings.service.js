// services/generalSettings.service.js
import fs from "fs";
import { uploadOnS3, deleteFromS3ByKey } from "../../../utils/s3Upload.js";
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

// ── S3 helpers ────────────────────────────────────────────────────────────────

/**
 * Upload banner via disk path (multer diskStorage → req.file.path).
 * Deletes the local temp file after upload regardless of success/failure.
 */
const uploadBannerToS3 = async (file) => {
  const localPath = file.path;

  try {
    const result = await uploadOnS3(
      localPath,
      "activline/banners"
    );

    if (!result) {
      throw new ApiError(500, "S3 upload failed — no URL returned");
    }

    return result; // { secure_url, key, public_id, resource_type, format }
  } finally {
    // Always clean up temp file from disk — never leave orphaned files
    fs.unlink(localPath, (err) => {
      if (err) console.warn("⚠️  Could not delete temp file:", localPath, err.message);
    });
  }
};

/**
 * Delete a banner from S3 by stored s3_key.
 * Non-fatal — logs warning but never blocks DB operations.
 */
const deleteBannerFromS3 = async (s3Key) => {
  if (!s3Key) return;
  await deleteFromS3ByKey(s3Key);
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
 * CREATE — upload to S3 via disk path, push new item into banners[].
 */
export const createBannerService = async (file) => {
  const uploaded = await uploadBannerToS3(file);

  if (!uploaded?.secure_url) {
    throw new ApiError(500, "S3 upload failed — no URL returned");
  }

  const fileType = file.mimetype?.startsWith("image/") ? "image" : "video";

  const doc = await Banner.findOneAndUpdate(
    {},
    {
      $push: {
        banners: {
          file_type: fileType,
          url: uploaded.secure_url,
          s3_key: uploaded.key,
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
 * 2. Delete old S3 resource (best-effort).
 * 3. Update DB.
 */
export const updateBannerService = async (bannerId, file) => {
  const doc = await Banner.findOne({ "banners._id": bannerId });
  if (!doc) throw new ApiError(404, "Banner not found");

  const existingItem = doc.banners.id(bannerId);

  // 1. Upload new file
  const uploaded = await uploadBannerToS3(file);
  if (!uploaded?.secure_url) {
    throw new ApiError(500, "S3 upload failed — no URL returned");
  }

  const fileType = file.mimetype?.startsWith("image/") ? "image" : "video";

  // 2. Delete old S3 resource
  await deleteBannerFromS3(existingItem.s3_key);

  // 3. Update subdocument
  existingItem.file_type = fileType;
  existingItem.url = uploaded.secure_url;
  existingItem.s3_key = uploaded.key;

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
 * DELETE — remove from S3 then pull from banners[].
 */
export const deleteBannerService = async (bannerId) => {
  const doc = await Banner.findOne({ "banners._id": bannerId });
  if (!doc) throw new ApiError(404, "Banner not found");

  const item = doc.banners.id(bannerId);

  await deleteBannerFromS3(item.s3_key);

  doc.banners.pull({ _id: bannerId });
  await doc.save();

  return { deletedId: bannerId };
};
