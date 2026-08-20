// middlewares/upload.middleware.js
// ⚡ Re-exports from multer.middleware.js — single source of truth.
// chatUpload streams chat files directly to S3 (activline/chat/).
export { chatUpload } from "./multer.middleware.js";
