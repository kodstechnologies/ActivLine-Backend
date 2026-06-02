import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import * as planUsageService from "../../services/Customer/dailyDataUsage.service.js";

export const getPlanUsageHistory = asyncHandler(async (req, res) => {
  const customerId = req.user._id;
  console.log("Customer ID:", req.user);
  const historyData = await planUsageService.getPlanUsageHistory(customerId);

  return res
    .status(200)
    .json(
      ApiResponse.success(
        historyData,
        "Daily plan usage history fetched successfully",
      ),
    );
});
