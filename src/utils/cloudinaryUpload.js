// utils/cloudinaryUpload.js
// ⚡ SHIM — Cloudinary has been replaced by AWS S3.
// Re-exports `uploadToS3` under the old name `uploadToCloudinary` so
// chat.upload.controller.js, adminCredential.controller.js,
// razorpay.controller.js, and socket/index.js need no import changes.

import { uploadToS3 } from "./s3Upload.js";

/**
 * Upload a file from an in-memory buffer to S3.
 * Drop-in replacement for the old `uploadToCloudinary({ buffer, mimetype, originalname })`.
 *
 * Returns the same shape as before:
 *   { secure_url, key, public_id, bytes, resource_type, format }
 *
 * @param {{ buffer: Buffer, mimetype: string, originalname: string }} opts
 */
export const uploadToCloudinary = async ({ buffer, mimetype, originalname }) => {
  return uploadToS3({
    buffer,
    mimetype,
    originalname,
    folder: "activline/uploads",
  });
};