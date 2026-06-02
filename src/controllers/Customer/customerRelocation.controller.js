import * as relocationService from "../../services/Customer/relocation.service.js";
import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import ApiError from "../../utils/ApiError.js";
import {
  createRelocationSchema,
  updateRelocationSchema,
} from "../../validations/Customer/relocation.validation.js";
import { createActivityLog } from "../../services/ActivityLog/activityLog.service.js";

// @desc Create a relocation request
// @route POST /api/customer/relocation
export const createRelocation = asyncHandler(async (req, res) => {
  const { error, value } = createRelocationSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw new ApiError(
      400,
      error.details.map((detail) => detail.message).join(", "),
    );
  }

  const data = await relocationService.createRelocationService(req.user, value);
  return res
    .status(201)
    .json(
      ApiResponse.success(data, "Relocation request submitted successfully"),
    );
});

// @desc Get relocation requests (Paginated and Filtered)
// @route GET /api/customer/relocation
export const getRelocations = asyncHandler(async (req, res) => {
  const data = await relocationService.getRelocationsService(
    req.user,
    req.query,
  );
  return res
    .status(200)
    .json(ApiResponse.success(data, "Relocation records fetched successfully"));
});

// @desc Update relocation request or status
// @route PUT /api/customer/relocation/:relocationId
export const updateRelocation = asyncHandler(async (req, res) => {
  const { error, value } = updateRelocationSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw new ApiError(
      400,
      error.details.map((detail) => detail.message).join(", "),
    );
  }

  const data = await relocationService.updateRelocationService(
    req.user,
    req.params.relocationId,
    value,
  );

  await createActivityLog({
    req,
    action: "UPDATE",
    module: "RELOCATION",
    description: `Updated relocation request status to "${value.status || "EDITED"}" for customer ID: ${data.userId}`,
    targetId: String(data._id),
    metadata: {
      relocationId: data._id,
      customerId: data.userId,
      newStatus: value.status || "EDITED",
      updatedFields: Object.keys(value || {}),
    },
  });

  return res
    .status(200)
    .json(ApiResponse.success(data, "Relocation request updated successfully"));
});

// @desc Delete relocation request (Reject)
// @route DELETE /api/customer/relocation/:relocationId
export const deleteRelocation = asyncHandler(async (req, res) => {
  await relocationService.deleteRelocationService(
    req.user,
    req.params.relocationId,
  );
  return res
    .status(200)
    .json(
      ApiResponse.success(null, "Relocation request rejected successfully"),
    );
});

// @desc Get current customer's latest relocation request
// @route GET /api/customer/relocation/me
export const getMyRelocation = asyncHandler(async (req, res) => {
  const data = await relocationService.getMyRelocationService(req.user);

  return res
    .status(200)
    .json(
      ApiResponse.success(
        { status: { isPending: data?.status === "PENDING" ? true : false } },
        "Current customer's relocation record fetched successfully",
      ),
    );
});
