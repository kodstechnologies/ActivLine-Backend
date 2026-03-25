import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import {
  createMyCompanyProfile,
  deleteMyCompanyProfile,
  getMyCompanyProfile,
  updateMyCompanyProfile,
} from "../../services/company/companyProfile.service.js";
import {
  validateCompanyProfileCreate,
  validateCompanyProfileUpdate,
} from "../../validations/company/companyProfile.validation.js";

export const getCompanyProfile = asyncHandler(async (req, res) => {
  const profile = await getMyCompanyProfile(req.user);

  res
    .status(200)
    .json(ApiResponse.success(profile, "Company profile fetched successfully"));
});

export const createCompanyProfile = asyncHandler(async (req, res) => {
  validateCompanyProfileCreate(req.body);

  const profile = await createMyCompanyProfile(req.user, req.body);

  res
    .status(201)
    .json(ApiResponse.success(profile, "Company profile created successfully"));
});

export const updateCompanyProfile = asyncHandler(async (req, res) => {
  validateCompanyProfileUpdate(req.body);

  const profile = await updateMyCompanyProfile(req.user, req.body);

  res
    .status(200)
    .json(ApiResponse.success(profile, "Company profile updated successfully"));
});

export const deleteCompanyProfile = asyncHandler(async (req, res) => {
  await deleteMyCompanyProfile(req.user);

  res
    .status(200)
    .json(ApiResponse.success(null, "Company profile deleted successfully"));
});
