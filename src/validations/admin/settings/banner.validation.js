// validations/admin/settings/banner.validation.js
import { ApiError } from "../../../utils/ApiError.js";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo"];

/**
 * Validates that a file exists and is either an image or a video.
 * Throws ApiError(400) on violation so asyncHandler passes it to global error handler.
 */
export const validateBannerFile = (file) => {
  if (!file) {
    throw new ApiError(400, "Banner file is required");
  }

  const isImage = file.mimetype?.startsWith("image/");
  const isVideo = file.mimetype?.startsWith("video/");

  if (!isImage && !isVideo) {
    throw new ApiError(
      400,
      `Only image or video files are allowed.`
    );
  }
};
