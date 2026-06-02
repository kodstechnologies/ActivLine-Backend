import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import { ApiError } from "../../utils/ApiError.js";
import OttTransaction from "../../models/ott/ottTransaction.model.js";
import { getOttPartnerBalance } from "../../services/ott/playbox.service.js";

/**
 * @desc Get OTT Partner Balance (PlayBoxTV Wallet)
 * @route GET /api/v1/admin/ott/balance
 */
export const getPartnerBalance = asyncHandler(async (req, res) => {
  const balance = await getOttPartnerBalance();
  
  res.status(200).json(
    ApiResponse.success({ balance }, "Partner balance retrieved successfully")
  );
});

/**
 * @desc Get all OTT Transactions across all customers
 * @route GET /api/v1/admin/ott/transactions
 */
export const getGlobalOttTransactions = asyncHandler(async (req, res) => {
  const transactions = await OttTransaction.find()
    .populate("customerId", "userName phoneNumber email")
    .sort({ createdAt: -1 })
    .limit(100);

  res.status(200).json(
    ApiResponse.success(transactions, "OTT transactions retrieved successfully")
  );
});
