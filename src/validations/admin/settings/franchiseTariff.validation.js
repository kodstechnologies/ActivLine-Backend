import mongoose from "mongoose";
import { ApiError } from "../../../utils/ApiError.js";

/**
 * Validates payload for creating or updating a tariff
 * @param {object} body
 */
export const validateCreateOrUpdateTariff = (body) => {
  const { franchiseId, tariffType, tariffValue, isActive } = body;

  if (!franchiseId) {
    throw new ApiError(400, "Franchise ID is required");
  }



  if (!tariffType) {
    throw new ApiError(400, "Tariff type is required");
  }

  if (!["FIXED", "PERCENTAGE"].includes(tariffType)) {
    throw new ApiError(
      400,
      "Tariff type must be either 'FIXED' or 'PERCENTAGE'",
    );
  }

  if (tariffValue === undefined || tariffValue === null) {
    throw new ApiError(400, "Tariff value is required");
  }

  const numericValue = Number(tariffValue);
  if (isNaN(numericValue) || numericValue < 0) {
    throw new ApiError(400, "Tariff value must be a non-negative number");
  }

  if (isActive !== undefined && typeof isActive !== "boolean") {
    throw new ApiError(400, "isActive must be a boolean value");
  }
};

/**
 * Validates route parameters for fetching tariff
 * @param {string} franchiseId
 */
export const validateGetTariff = (franchiseId) => {
  if (!franchiseId) {
    throw new ApiError(400, "Franchise ID is required");
  }
};
