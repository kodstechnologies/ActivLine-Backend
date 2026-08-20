// services/generalSettings.service.js
// multer-s3 now streams banners DIRECTLY to S3 — no manual upload needed here.
import { deleteFromS3ByKey } from "../../../utils/s3Upload.js";
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

// ── S3 delete helper ──────────────────────────────────────────────────────────

/**
 * Delete a banner from S3 by stored s3_key. Non-fatal.
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
  if (!doc) doc = await Banner.create({ banners: [] });
  return doc;
};

/**
 * CREATE — multer-s3 already uploaded the file to S3.
 * req.file contains:  location (URL), key (S3 key), mimetype, size
 */
export const createBannerService = async (file) => {
  if (!file?.location) {
    throw new ApiError(500, "S3 upload failed — no URL returned");
  }

  const fileType = file.mimetype?.startsWith("image/") ? "image" : "video";

  const doc = await Banner.findOneAndUpdate(
    {},
    {
      $push: {
        banners: {
          file_type: fileType,
          url: file.location,   // ✅ S3 URL from multer-s3
          s3_key: file.key,     // ✅ S3 key for future deletion
          isActive: true,
        },
      },
    },
    { upsert: true, new: true }
  );

  return doc.banners[doc.banners.length - 1];
};

/**
 * UPDATE — multer-s3 already uploaded the new file.
 * 1. Delete old S3 file.
 * 2. Update DB with new URL + key.
 */
export const updateBannerService = async (bannerId, file) => {
  if (!file?.location) {
    throw new ApiError(500, "S3 upload failed — no URL returned");
  }

  const doc = await Banner.findOne({ "banners._id": bannerId });
  if (!doc) throw new ApiError(404, "Banner not found");

  const existingItem = doc.banners.id(bannerId);

  // Delete old S3 object (best-effort)
  await deleteBannerFromS3(existingItem.s3_key);

  const fileType = file.mimetype?.startsWith("image/") ? "image" : "video";
  existingItem.file_type = fileType;
  existingItem.url = file.location;
  existingItem.s3_key = file.key;

  await doc.save();
  return existingItem;
};

/**
 * TOGGLE isActive — flip without deleting.
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
