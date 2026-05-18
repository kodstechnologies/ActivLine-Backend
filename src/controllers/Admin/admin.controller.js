import * as AdminService from "../../services/admin/admin.service.js";
import ApiResponse from "../../utils/ApiReponse.js";
import { asyncHandler } from "../../utils/AsyncHandler.js";
export const getAllStaff = async (req, res) => {
  const staff = await AdminService.getAllStaff();
  res.json(ApiResponse.success(staff, "Staff fetched successfully"));
};
export const getAdminStaff = asyncHandler(async (_req, res) => {
  const staff = await AdminService.getAdminStaffList();
  res.json(
    ApiResponse.success(staff, "Admin staff fetched")
  );
});