import { asyncHandler } from "../../../utils/AsyncHandler.js";
import ApiResponse from "../../../utils/ApiReponse.js";
import {
  validateCreateOrUpdateTariff,
  validateGetTariff,
} from "../../../validations/admin/settings/franchiseTariff.validation.js";
import {
  createOrUpdateTariffService,
  getTariffByFranchiseIdService,
} from "../../../services/admin/settings/franchiseTariff.service.js";
import { createActivityLog } from "../../../services/ActivityLog/activityLog.service.js";

/**
 * Controller to create or update a franchise tariff configuration
 * POST /api/v1/admin/tariff
 */
export const createOrUpdateTariff = asyncHandler(async (req, res) => {
  // 1. Perform validations
  validateCreateOrUpdateTariff(req.body);

  // 2. Fetch authenticated admin ID
  const adminId = req.user?._id;

  // 3. Process database changes through service layer
  const tariff = await createOrUpdateTariffService(req.body, adminId);

  // 3.1 Log this transaction in audit trails
  await createActivityLog({
    req,
    action: "UPDATE",
    module: "TARIFF",
    description: `Configured tariff settings for franchise: ${req.body.franchiseId} (Type: ${req.body.tariffType}, Value: ${req.body.tariffValue})`,
    targetId: String(tariff._id),
    metadata: {
      franchiseId: req.body.franchiseId,
      tariffType: req.body.tariffType,
      tariffValue: req.body.tariffValue,
      isActive: req.body.isActive
    }
  });

  // 4. Return success response
  res
    .status(200)
    .json(
      ApiResponse.success(tariff, "Franchise tariff configured successfully"),
    );
});

/**
 * Controller to fetch franchise tariff configuration details
 * GET /api/v1/admin/tariff/:franchiseId
 */
export const getTariffByFranchiseId = asyncHandler(async (req, res) => {
  const { franchiseId } = req.params;

  // 1. Validate route params
  // validateGetTariff(franchiseId);

  // 2. Query data through service layer
  const tariff = await getTariffByFranchiseIdService(franchiseId);

  // 3. Return success response
  res
    .status(200)
    .json(
      ApiResponse.success(
        tariff,
        "Franchise tariff details fetched successfully",
      ),
    );
});
