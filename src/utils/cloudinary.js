// utils/cloudinary.js
// ⚡ SHIM — Cloudinary has been replaced by AWS S3.
// All exports preserve the exact same names so every importing file
// (customer.service.js, generalSettings.service.js, razorpay.controller.js …)
// continues to work without changing a single import statement.

import {
  uploadOnS3,
  deleteFromS3,
  getS3DownloadUrl,
} from "./s3Upload.js";

// ── Named exports (same as the old cloudinary.js) ────────────────────────────

/**
 * Upload a file from a local disk path to S3.
 * Drop-in replacement for the old `uploadOnCloudinary(localFilePath)`.
 */
export const uploadOnCloudinary = uploadOnS3;

/**
 * Delete a file from S3 by its stored URL.
 * Drop-in replacement for the old `deleteFromCloudinary(fileUrl)`.
 */
export const deleteFromCloudinary = deleteFromS3;

// ── Default export — mirrors the `cloudinary` v2 object surface used in code ──
// Only the `.url()` method is called externally (razorpay.controller.js).

const cloudinaryShim = {
  url: getS3DownloadUrl,
};

export default cloudinaryShim;