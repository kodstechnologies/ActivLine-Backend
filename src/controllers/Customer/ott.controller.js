import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import { ApiError } from "../../utils/ApiError.js";
import OttTransaction from "../../models/ott/ottTransaction.model.js";
import Customer from "../../models/Customer/customer.model.js";
import {
  getAvailableOttPacks,
  assignOttPack,
  getCustomerActivePacks,
} from "../../services/ott/playbox.service.js";

/**
 * @desc Get available OTT packs
 * @route GET /api/v1/customer/ott/plans
 */
export const listAvailablePacks = asyncHandler(async (req, res) => {
  const packs = await getAvailableOttPacks();
  
  res.status(200).json(
    ApiResponse.success(packs, "Available OTT packs retrieved successfully")
  );
});

/**
 * @desc Get customer's active OTT subscriptions
 * @route GET /api/v1/customer/ott/my-packs
 */
export const getMySubscriptions = asyncHandler(async (req, res) => {
  const customerId = req.user?._id;
  
  const customer = await Customer.findById(customerId);
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  // Fetch active packs from PlayBoxTV API
  const activePacks = await getCustomerActivePacks(customer.phoneNumber);

  res.status(200).json(
    ApiResponse.success(activePacks, "Active subscriptions retrieved successfully")
  );
});

/**
 * @desc Activate/Purchase an OTT Pack
 * @route POST /api/v1/customer/ott/activate
 */
export const activatePack = asyncHandler(async (req, res) => {
  const customerId = req.user?._id;
  const { packCode, packName, amount } = req.body;

  if (!packCode || !packName || amount === undefined) {
    throw new ApiError(400, "Pack code, name, and amount are required");
  }

  const customer = await Customer.findById(customerId);
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  // NOTE: Here you would ideally deduct the `amount` from a customer wallet 
  // or verify that a Razorpay payment has been completed.
  // For this implementation, we proceed to assign the pack.

  // Call the external PlayBoxTV service
  const playboxResponse = await assignOttPack(
    customer.phoneNumber,
    customer.userName,
    customer.email,
    customer._id,
    packCode
  );

  // Playbox response data structure from documentation
  // The data usually contains an ID referencing the assignment.
  const playboxTransactionId = typeof playboxResponse.data === 'string' 
    ? playboxResponse.data 
    : playboxResponse.id || `TXN_${Date.now()}`;

  // Store transaction in our local DB for audit/ledger
  const transaction = await OttTransaction.create({
    customerId: customer._id,
    franchiseId: customer.franchiseId || customer._id, // fallback if franchise missing
    playboxTransactionId,
    packCode,
    packName,
    amount: Number(amount),
    status: "ACTIVE",
    validityDays: req.body.validity || 30, // Default or passed from frontend
    startAt: new Date(),
    expiryAt: new Date(Date.now() + (req.body.validity || 30) * 24 * 60 * 60 * 1000),
    otts: [] 
  });

  res.status(200).json(
    ApiResponse.success(
      { transaction, playboxResponse },
      "OTT Pack assigned successfully"
    )
  );
});
