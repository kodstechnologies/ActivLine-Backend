import { asyncHandler } from "../../../utils/AsyncHandler.js";
import ApiResponse from "../../../utils/ApiReponse.js";

import {
  createCannedResponseService,
  getResponsesByCategoryService,
  getAllResponsesService,
  updateCannedResponseService,
  deleteCannedResponseService,
} from "../../../services/admin/settings/cannedResponse.service.js";


import { validateCannedResponse } from "../../../validations/admin/settings/cannedResponse.validation.js";

export const createCannedResponse = asyncHandler(async (req, res) => {
  validateCannedResponse(req.body);

  const response = await createCannedResponseService(
    req.body,
    req.user._id
  );

  res.status(201).json(
    ApiResponse.success(response, "Canned response created")
  );
});

export const getAllCannedResponses = asyncHandler(async (req, res) => {
  const { categoryId } = req.params || {};
  const responses = categoryId
    ? await getResponsesByCategoryService(categoryId)
    : await getAllResponsesService();

  res.status(200).json(
    ApiResponse.success(responses, "Canned responses fetched")
  );
});

export const updateCannedResponse = asyncHandler(async (req, res) => {
  validateCannedResponse(req.body);

  const updated = await updateCannedResponseService(
    req.params.id,
    req.body
  );

  res.status(200).json(
    ApiResponse.success(updated, "Canned response updated")
  );
});

export const deleteCannedResponse = asyncHandler(async (req, res) => {
  await deleteCannedResponseService(req.params.id);

  res.status(200).json(
    ApiResponse.success(null, "Canned response deleted")
  );
});
