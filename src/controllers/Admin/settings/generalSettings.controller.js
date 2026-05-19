// controllers/generalSettings.controller.js
import { asyncHandler } from "../../../utils/AsyncHandler.js";
import ApiResponse from "../../../utils/ApiReponse.js";
import {
  getGeneralSettingsService,
  updateGeneralSettingsService,
  getAllBannersService,
  createBannerService,
  updateBannerService,
  toggleBannerService,
  deleteBannerService,
} from "../../../services/admin/settings/generalSettings.service.js";
import { validateGeneralSettings } from "../../../validations/admin/settings/generalSettings.validation.js";
import { validateBannerFile } from "../../../validations/admin/settings/banner.validation.js";

// ── General Settings ──────────────────────────────────────────────────────────

export const getGeneralSettings = asyncHandler(async (req, res) => {
  const settings = await getGeneralSettingsService();

  res.status(200).json(
    ApiResponse.success(settings, "General settings fetched successfully")
  );
});

export const updateGeneralSettings = asyncHandler(async (req, res) => {
  validateGeneralSettings(req.body);

  const settings = await updateGeneralSettingsService(req.body, req.user._id);

  res.status(200).json(
    ApiResponse.success(settings, "General settings updated successfully")
  );
});

// ── Banners ───────────────────────────────────────────────────────────────────

/**
 * GET /banner — fetch all banners
 */
export const getAllBanners = asyncHandler(async (req, res) => {
  const data = await getAllBannersService();
  res.status(200).json(ApiResponse.success(data, "Banners fetched successfully"));
});

/**
 * POST /banner/create — upload and add a new banner (image or video)
 */
export const createBanner = asyncHandler(async (req, res) => {
  validateBannerFile(req.file); // throws 400 if missing or wrong type

  const banner = await createBannerService(req.file);

  res.status(201).json(ApiResponse.success(banner, "Banner added successfully"));
});

/**
 * PUT /banner/:bannerId — replace a banner's file (image or video)
 */
export const updateBanner = asyncHandler(async (req, res) => {
  const { bannerId } = req.params;
  validateBannerFile(req.file);

  const banner = await updateBannerService(bannerId, req.file);

  res.status(200).json(ApiResponse.success(banner, "Banner updated successfully"));
});

/**
 * PATCH /banner/:bannerId/toggle — enable or disable a banner
 */
export const toggleBanner = asyncHandler(async (req, res) => {
  const { bannerId } = req.params;

  const banner = await toggleBannerService(bannerId);

  res.status(200).json(
    ApiResponse.success(banner, `Banner ${banner.isActive ? "activated" : "deactivated"} successfully`)
  );
});

/**
 * DELETE /banner/:bannerId — remove a banner and clean up Cloudinary
 */
export const deleteBanner = asyncHandler(async (req, res) => {
  const { bannerId } = req.params;

  const result = await deleteBannerService(bannerId);

  res.status(200).json(ApiResponse.success(result, "Banner deleted successfully"));
});