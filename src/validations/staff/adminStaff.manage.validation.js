import ApiError from "../../utils/ApiError.js";
import mongoose from "mongoose";

export const validateStaffIdParam = (id) => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid Staff ID");
  }
};

export const validateUpdateAdminStaff = (data) => {
  const forbiddenFields = ["role", "createdBy"];

  forbiddenFields.forEach((field) => {
    if (field in data) {
      delete data[field]; // Silently remove forbidden fields instead of throwing error
    }
  });

  if (data.status && !["ACTIVE", "DISABLED"].includes(data.status)) {
    throw new ApiError(400, "Invalid status value");
  }
};
