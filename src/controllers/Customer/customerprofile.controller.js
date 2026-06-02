import { asyncHandler } from "../../utils/AsyncHandler.js";
import { ApiResponse } from "../../utils/ApiReponse.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  getActivlineUserDetails,
  editActivlineUserProfile,
  getCustomerProfile,
  getMyReferralsService,
} from "../../services/Customer/customerprofile.service.js";
import Customer from "../../models/Customer/customer.model.js";
import Referral from "../../models/Customer/referral.model.js";

/**
 * Get profile for currently authenticated customer
 */
export const getProfile = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "User ID not found in token");
  }

  const customer = await getCustomerProfile(userId);

  const customerData = customer?.toObject ? customer.toObject() : customer;

  if (!customerData.installationAddress) {
    customerData.installationAddress = {
      line1: null,
      line2: null,
      city: null,
      pin: null,
      state: null,
      country: null,
    };
  }

  return res
    .status(200)
    .json(
      ApiResponse.success(
        customerData,
        "Customer profile fetched successfully",
      ),
    );
});

export const fetchUserFullDetails = asyncHandler(async (req, res) => {
  const { user_id } = req.params;

  if (!user_id) {
    throw new ApiError(400, "user_id is required");
  }

  const activlineData = await getActivlineUserDetails(user_id);

  return res.status(200).json({
    success: true,
    message: "User full details fetched successfully",
    data: activlineData,
    meta: {
      source: "activline",
    },
  });
});

export const editUserProfile = asyncHandler(async (req, res) => {
  const payload = req.body;

  if (!payload.userId) {
    throw new ApiError(400, "userId is required");
  }

  const activlineResponse = await editActivlineUserProfile(payload);

  return res.status(200).json({
    success: true,
    message: "User profile updated successfully",
    data: activlineResponse,
  });
});

/**
 * Get referral summary for currently authenticated customer
 */
export const getMyReferrals = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "User ID not found in token");
  }

  const referralSummary = await getMyReferralsService(userId);

  return res.status(200).json(
    ApiResponse.success(referralSummary, "Referral summary fetched successfully")
  );
});
