import mongoose from "mongoose";
import FranchiseTariff from "../../../models/admin/Settings/franchiseTariff.model.js";
import Franchise from "../../../models/Franchise/franchise.model.js";
import { ApiError } from "../../../utils/ApiError.js";

/**
 * Service to create or update (upsert) a tariff configuration for a franchise
 * @param {object} data - Tariff details
 * @param {string} adminId - Admin user making the change
 */
export const createOrUpdateTariffService = async (data, adminId) => {
  const { franchiseId, tariffType, tariffValue, isActive } = data;

  // 1. Ensure the franchise actually exists in the database by accountId or _id
  const franchise = await Franchise.findOne({
    $or: [
      { accountId: franchiseId },
      mongoose.Types.ObjectId.isValid(franchiseId) ? { _id: franchiseId } : null,
    ].filter(Boolean),
  });
  if (!franchise) {
    throw new ApiError(404, "Franchise not found");
  }

  // 2. Perform the upsert (Update if exists, else Create)
  const tariff = await FranchiseTariff.findOneAndUpdate(
    { franchiseId },
    {
      tariffType,
      tariffValue,
      isActive: isActive !== undefined ? isActive : true,
      updatedBy: adminId,
    },
    { new: true, upsert: true },
  );

  return tariff;
};

/**
 * Service to get a tariff configuration by franchise ID
 * @param {string} franchiseId
 */
export const getTariffByFranchiseIdService = async (franchiseId) => {
  // 1. Ensure the franchise exists by accountId or _id
  const franchise = await Franchise.findOne({
    $or: [
      { accountId: franchiseId },
      mongoose.Types.ObjectId.isValid(franchiseId) ? { _id: franchiseId } : null,
    ].filter(Boolean),
  });
  if (!franchise) {
    throw new ApiError(404, "Franchise not found");
  }

  // 2. Fetch the tariff config
  const tariff = await FranchiseTariff.findOne({ franchiseId });

  // 3. If no tariff is found, return a default mock/fallback to avoid breaking the frontend
  if (!tariff) {
    return {
      franchiseId,
      tariffType: "FIXED",
      tariffValue: 0,
      isActive: false,
      isDefault: true,
    };
  }

  return tariff;
};
