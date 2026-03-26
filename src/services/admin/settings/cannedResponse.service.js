import mongoose from "mongoose";
import ApiError from "../../../utils/ApiError.js";
import CannedResponse from "../../../models/admin/Settings/cannedResponse.model.js";

/**
 * ➕ CREATE RESPONSE
 */
export const createCannedResponseService = async (data) => {
  return CannedResponse.create({
    categoryId: new mongoose.Types.ObjectId(data.categoryId),
    title: data.title,
    message: data.message,
  });
}; 

/**
 * 📖 GET RESPONSES BY CATEGORY
 */
export const getResponsesByCategoryService = async (categoryId) => {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new ApiError(400, "Invalid category ID");
  }

  return CannedResponse.find({
    categoryId: new mongoose.Types.ObjectId(categoryId),
  }).sort({ createdAt: 1 });
};

/**
 * 📖 GET ALL RESPONSES
 */
export const getAllResponsesService = async () => {
  return CannedResponse.find({}).sort({ createdAt: 1 });
};

/**
 * ✏️ UPDATE RESPONSE
 */
export const updateCannedResponseService = async (id, data) => {
  const response = await CannedResponse.findById(id);

  if (!response) {
    throw new ApiError(404, "Canned response not found");
  }

  response.title = data.title;
  response.message = data.message;
  await response.save();

  return response;
};

/**
 * 🗑️ DELETE RESPONSE
 */
export const deleteCannedResponseService = async (id) => {
  const response = await CannedResponse.findById(id);

  if (!response) {
    throw new ApiError(404, "Canned response not found");
  }

  await response.deleteOne();
  return true;
};
