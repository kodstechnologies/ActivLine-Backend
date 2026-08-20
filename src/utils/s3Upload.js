// utils/s3Upload.js
// AWS S3 replacement for Cloudinary — exposes the same return-value shape
// so all existing callers work without changes.

import "dotenv/config";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

// ── S3 Client ─────────────────────────────────────────────────────────────────

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET_NAME;
const BASE_URL = process.env.AWS_S3_BASE_URL; // e.g. https://my-bucket.s3.ap-south-1.amazonaws.com

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a public HTTPS URL from an S3 object key.
 * @param {string} key  S3 object key, e.g. "activline/banners/123-foo.jpg"
 * @returns {string}
 */
const buildUrl = (key) => `${BASE_URL}/${key}`;

/**
 * Extract the S3 key from a full URL stored in the DB.
 * e.g. "https://bucket.s3.region.amazonaws.com/activline/banners/foo.jpg"
 *       → "activline/banners/foo.jpg"
 */
const extractKeyFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    // pathname starts with "/" — strip it
    return parsed.pathname.replace(/^\//, "");
  } catch {
    return url; // already a bare key — pass through
  }
};

/**
 * Detect resource type from mimetype (mirrors Cloudinary's resource_type).
 * @param {string} mimetype
 * @returns {"image"|"video"|"raw"}
 */
const getResourceType = (mimetype = "") => {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  return "raw";
};

/**
 * Sanitise a filename for use as part of an S3 key.
 */
const sanitizeFilename = (name = "") =>
  name.replace(/[^a-zA-Z0-9.\-_]/g, "_");

// ── uploadOnS3 ────────────────────────────────────────────────────────────────

/**
 * Upload a file from a local disk path to S3.
 * Mirrors `uploadOnCloudinary(localFilePath)` — returns { secure_url, key }.
 *
 * @param {string} localFilePath  Absolute path to the file on disk.
 * @param {string} [folder="activline/uploads"]  S3 key prefix (folder).
 * @returns {Promise<{ secure_url: string, key: string, resource_type: string } | null>}
 */
export const uploadOnS3 = async (localFilePath, folder = "activline/uploads") => {
  try {
    if (!localFilePath) return null;

    const fileBuffer = fs.readFileSync(localFilePath);
    const ext = path.extname(localFilePath).toLowerCase();
    const basename = path.basename(localFilePath);
    const mimeType = guessMimeFromExt(ext);

    const key = `${folder}/${Date.now()}-${sanitizeFilename(basename)}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
      })
    );

    const secure_url = buildUrl(key);
    console.log(`✅ S3 upload (disk): ${secure_url}`);

    return {
      secure_url,
      key,
      public_id: key, // backwards-compat alias
      resource_type: getResourceType(mimeType),
      format: ext.replace(".", ""),
    };
  } catch (error) {
    console.error("❌ S3 upload (disk) failed:", error.message);
    return null;
  }
};

// ── deleteFromS3 ──────────────────────────────────────────────────────────────

/**
 * Delete a file from S3 by its stored URL (or bare key).
 * Mirrors `deleteFromCloudinary(fileUrl)`.
 *
 * @param {string} fileUrl  Full S3 URL or bare key stored in the DB.
 */
export const deleteFromS3 = async (fileUrl) => {
  try {
    if (!fileUrl) return;

    const key = extractKeyFromUrl(fileUrl);
    console.log(`🗑 Deleting from S3: ${key}`);

    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );
  } catch (error) {
    console.error("❌ S3 delete failed:", error.message);
  }
};

/**
 * Delete a file from S3 by its bare key (used by banner service).
 * Non-fatal — logs a warning but never throws.
 *
 * @param {string} key  S3 object key, e.g. "activline/banners/123-foo.jpg"
 */
export const deleteFromS3ByKey = async (key) => {
  try {
    if (!key) return;
    console.log(`🗑 Deleting from S3 by key: ${key}`);
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    console.warn("⚠️  S3 delete failed (continuing):", err?.message);
  }
};

// ── uploadToS3 (buffer-based) ─────────────────────────────────────────────────

/**
 * Upload a file from an in-memory buffer to S3.
 * Mirrors `uploadToCloudinary({ buffer, mimetype, originalname })`.
 *
 * Returns an object shaped like Cloudinary's result so all callers
 * (chat, franchise admin, invoice, socket) work without changes.
 *
 * @param {{ buffer: Buffer, mimetype: string, originalname: string, folder?: string }} opts
 * @returns {Promise<{ secure_url: string, key: string, public_id: string, bytes: number, resource_type: string, format: string }>}
 */
export const uploadToS3 = async ({
  buffer,
  mimetype,
  originalname,
  folder = "activline/uploads",
}) => {
  const ext = path.extname(originalname).toLowerCase() || guessMimeExt(mimetype);
  const sanitized = sanitizeFilename(
    originalname.replace(/\.[^/.]+$/, "") // strip extension
  );
  const key = `${folder}/${Date.now()}-${sanitized}${ext}`;

  console.log(`Uploading ${originalname} to S3 as ${key} (mime: ${mimetype})`);

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype || "application/octet-stream",
    })
  );

  const secure_url = buildUrl(key);
  const resourceType = getResourceType(mimetype);

  console.log(`✅ S3 upload (buffer): ${secure_url}`);

  return {
    secure_url,
    key,
    public_id: key, // backwards-compat alias
    bytes: buffer.length,
    resource_type: resourceType,
    format: ext.replace(".", ""),
  };
};

// ── getS3DownloadUrl ──────────────────────────────────────────────────────────

/**
 * Build a direct download URL for an S3 object.
 * Mirrors `cloudinary.url(public_id, { flags: "attachment" })`.
 *
 * For public buckets the secure_url IS the download URL.
 * If you switch to private buckets, replace this with a pre-signed URL.
 *
 * @param {string} keyOrUrl  S3 key or full URL.
 * @returns {string}
 */
export const getS3DownloadUrl = (keyOrUrl) => {
  // If it's already a full URL, return it as-is
  if (keyOrUrl?.startsWith("http")) return keyOrUrl;
  return buildUrl(keyOrUrl);
};

// ── MIME helpers ──────────────────────────────────────────────────────────────

const EXT_TO_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const MIME_TO_EXT = Object.fromEntries(
  Object.entries(EXT_TO_MIME).map(([k, v]) => [v, k])
);

const guessMimeFromExt = (ext) => EXT_TO_MIME[ext] || "application/octet-stream";
const guessMimeExt = (mime) => MIME_TO_EXT[mime] || "";

export default s3;
