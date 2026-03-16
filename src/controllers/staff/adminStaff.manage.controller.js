import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import { validateUpdateAdminStaff,validateStaffIdParam } from "../../validations/staff/adminStaff.manage.validation.js";
import * as StaffService from "../../services/staff/adminStaff.manage.service.js";
import { createActivityLog } from "../../services/ActivityLog/activityLog.service.js";


export const getAllAdminStaff = asyncHandler(async (req, res) => {
  const result = await StaffService.getAllAdminStaff(req.query || {});

  await createActivityLog({
    req,
    action: "VIEW",
    module: "ADMIN_STAFF",
    description: "Viewed admin staff list",
    metadata: {
      query: req.query || {},
      isSingle: result.isSingle,
    },
  });

  if (result.isSingle) {
    return res.json(
      ApiResponse.success(result.data, "Admin staff fetched successfully")
    );
  }

  return res.json(
    ApiResponse.success(
      result.data,
      "Admin staff list fetched successfully",
      result.meta
    )
  );
});

export const getSingleAdminStaff = asyncHandler(async (req, res) => {
  validateStaffIdParam(req.params.id);

  const staff = await StaffService.getSingleAdminStaff(
    req.params.id,
    req.user
  );

  return res.json(
    ApiResponse.success(staff, "Admin staff fetched successfully")
  );
});



export const updateAdminStaff = asyncHandler(async (req, res) => {
  validateUpdateAdminStaff(req.body);

  const staff = await StaffService.updateAdminStaff(
    req.params.id,
    req.body
  );

  await createActivityLog({
    req,
    action: "UPDATE",
    module: "ADMIN_STAFF",
    description: `Updated admin staff: ${staff.name || staff._id}`,
    targetId: staff._id,
    metadata: {
      updatedFields: Object.keys(req.body || {}),
    },
  });

  return res.json(
    ApiResponse.success(staff, "Admin staff updated successfully")
  );
});

export const deleteAdminStaff = asyncHandler(async (req, res) => {
  await StaffService.deleteAdminStaff(req.params.id);

  await createActivityLog({
    req,
    action: "DELETE",
    module: "ADMIN_STAFF",
    description: "Deleted admin staff",
    targetId: req.params.id,
  });

  return res.json(
    ApiResponse.success(null, "Admin staff deleted successfully")
  );
});

export const getAssignedStaffStats = asyncHandler(async (req, res) => {
  const result = await StaffService.getAssignedStaffStats(req.user, req.query || {});

  return res.json(
    ApiResponse.success(result, "Assigned staff stats fetched successfully")
  );
});

export const getLatestAssignedRooms = asyncHandler(async (req, res) => {
  const result = await StaffService.getLatestAssignedRooms(req.query?.limit, req.user);

  return res.json(
    ApiResponse.success(result, "Latest assigned rooms fetched successfully")
  );
});

export const getAssignedCustomers = asyncHandler(async (req, res) => {
  const result = await StaffService.getAssignedCustomers(req.user, req.query || {});

  return res.json(
    ApiResponse.success(result.data, "Assigned customers fetched successfully", result.meta)
  );
});

export const getAssignedCustomerById = asyncHandler(async (req, res) => {
  const result = await StaffService.getAssignedCustomerById(
    req.user,
    req.params.customerId,
    req.query || {}
  );

  return res.json(
    ApiResponse.success(result, "Assigned customer details fetched successfully")
  );
});

export const updateAssignedCustomer = asyncHandler(async (req, res) => {
  const result = await StaffService.updateAssignedCustomer(
    req.user,
    req.params.customerId,
    req.body || {},
    req.query || {}
  );

  return res.json(
    ApiResponse.success(result, "Assigned customer updated successfully")
  );
});

export const deleteAssignedCustomer = asyncHandler(async (req, res) => {
  await StaffService.deleteAssignedCustomer(req.user, req.params.customerId, req.query || {});

  return res.json(
    ApiResponse.success(null, "Assigned customer deleted successfully")
  );
});
