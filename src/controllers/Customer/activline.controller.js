// controllers/activline.controller.js
import {
  getUsersFromActivline,
  getProfileDetailsFromActivline,
  getLogoffTimeOnlineStatusFromActivline,
} from "../../services/Customer/activline.servise.js";
import { asyncHandler } from "../../utils/AsyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiReponse.js";

export const getFilteredUsers = async (req, res) => {
  const { page = 1, perPage = 10 } = req.params;

  const apiResponse = await getUsersFromActivline(page, perPage);

  const filteredData = apiResponse.data.map(user => ({
    username: user.username,
    name: user.name,
    last_name: user.last_name,
    email: user.email,
    company_name: user.company_name,
    status: user.status,
  }));

  res.json({
    status: "success",
    errorCode: 200,
    totalRecords: apiResponse.totalRecords,
    data: filteredData,
  });
};

export const getProfileDetails = async (req, res) => {
  const { profileId } = req.params;

  const apiResponse = await getProfileDetailsFromActivline(profileId);

  res.json(apiResponse);
};

export const getLogoffTimeOnlineStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    throw new ApiError(400, "userId is required");
  }

  const apiResponse = await getLogoffTimeOnlineStatusFromActivline(userId);

  if (!apiResponse || apiResponse.status !== "success") {
    const message = apiResponse?.message || "Failed to fetch customer status";
    throw new ApiError(502, message, apiResponse || null);
  }

  const sourceData = apiResponse?.data || {};
  const onlineRaw = String(sourceData.online || "").trim().toLowerCase();
  const isOnline = ["yes", "true", "1"].includes(onlineRaw);

  const data = {
    userId,
    lastLogOffTime: sourceData.lastLogOffTime || null,
    online: isOnline,
    status: isOnline ? "ONLINE" : "LOGOFF",
  };

  return res
    .status(200)
    .json(ApiResponse.success(data, "Customer status fetched successfully"));
});
