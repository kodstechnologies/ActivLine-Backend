import "dotenv/config";
import multer from "multer";
import multerS3 from "multer-s3";
import s3 from "../utils/s3Upload.js"; // re-use the shared S3Client
import path from "path";

const getBucketName = () => process.env.AWS_S3_BUCKET_NAME || "activline-bucket";

/**
 * Build a multer-s3 storage engine for a given folder.
 * Files land at: s3://<bucket>/<folder>/<timestamp>-<originalname>
 *
 * After upload, multer attaches to req.file / req.files[]:
 *   file.location   → public HTTPS URL  (use this instead of file.path)
 *   file.key        → S3 object key
 *   file.bucket     → bucket name
 *   file.size       → bytes
 */
const s3Storage = (folder = "activline/uploads") =>
  multerS3({
    s3,
    bucket: (req, file, cb) => {
      cb(null, getBucketName());
    },
    // Files are public — anyone with the URL can read them
    // Remove this line if you want private files (use pre-signed URLs then)
    acl: "public-read",
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const key = `${folder}/${Date.now()}-${sanitized}`;
      cb(null, key);
    },
  });

// ── General-purpose upload (customer docs, banner, etc.) ─────────────────────
export const upload = multer({
  storage: s3Storage("activline/uploads"),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// ── Chat-specific upload ───────────────────────────────────────────────────────
export const chatUpload = multer({
  storage: s3Storage("activline/chat"),
  fileFilter: (req, file, cb) => {
    // Allow images, PDFs, Word, Excel, and video
    const allowed = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "video/mp4", "video/quicktime",
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ── Banner upload (images + videos) ──────────────────────────────────────────
export const bannerUpload = multer({
  storage: s3Storage("activline/banners"),
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "video/mp4", "video/quicktime", "video/x-msvideo",
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only images and videos allowed for banners"));
    }
    cb(null, true);
  },
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB (videos)
});

// ── Profile image upload ───────────────────────────────────────────────────────
export const profileUpload = multer({
  storage: s3Storage("activline/profiles"),
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed for profile pictures"));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});
