import ApiError from "../../utils/ApiError.js";
import mongoose from "mongoose";
import * as StaffRepo from "../../repositories/staff/adminStaff.repository.js";
import StaffStatus from "../../models/staff/Staff.model.js";
import * as LogoutRepo from "../../repositories/auth/logout.repository.js";

const ALLOWED_FILTER_ROLES = ["SUPER_ADMIN", "ADMIN", "ADMIN_STAFF", "STAFF", "FRANCHISE_ADMIN"];

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeRoleFilters = (role) => {
  const raw = String(role || "").trim();
  if (!raw) return [];

  const roles = raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .map((item) => (item === "STAFF" ? "ADMIN_STAFF" : item))
    .filter((item) => ALLOWED_FILTER_ROLES.includes(item));

  return [...new Set(roles)];
};

const mapAdminWithStatus = (admin, statusMap) => ({
  ...admin.toObject(),
  status: statusMap[admin._id.toString()] || "ACTIVE",
});

export const getAllAdminStaff = async (query = {}) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, 20), 200);
  const search = String(query.search || "").trim();
  const roleFilters = normalizeRoleFilters(query.role);
  const requestedId = query.id ? String(query.id).trim() : "";

  if (requestedId) {
    if (!mongoose.Types.ObjectId.isValid(requestedId)) {
      throw new ApiError(400, "Invalid Staff ID");
    }
    const single = await getSingleAdminStaff(requestedId, null, { skipPermissionCheck: true });
    return {
      isSingle: true,
      data: single,
      meta: null,
    };
  }

  const adminRolesForQuery = roleFilters.length
    ? roleFilters.filter((role) => role !== "FRANCHISE_ADMIN")
    : ["SUPER_ADMIN", "ADMIN", "ADMIN_STAFF"];
  const includeFranchiseAdmins =
    roleFilters.length === 0 || roleFilters.includes("FRANCHISE_ADMIN");

  const [adminUsers, franchiseAdmins] = await Promise.all([
    adminRolesForQuery.length
      ? StaffRepo.findAllAdminStaff({ roles: adminRolesForQuery, search })
      : Promise.resolve([]),
    includeFranchiseAdmins
      ? StaffRepo.findAllFranchiseAdmins({ search })
      : Promise.resolve([]),
  ]);

  const statuses = await StaffStatus.find({
    staffId: { $in: adminUsers.map((s) => s._id) },
  });

  const statusMap = statuses.reduce((acc, curr) => {
    acc[curr.staffId.toString()] = curr.status;
    return acc;
  }, {});

  const mappedAdmins = adminUsers.map((staff) => mapAdminWithStatus(staff, statusMap));
  const mappedFranchiseAdmins = franchiseAdmins.map((staff) => ({
    ...staff.toObject(),
    status: staff.status || "ACTIVE",
  }));

  const merged = [...mappedAdmins, ...mappedFranchiseAdmins].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  const total = merged.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const skip = (page - 1) * limit;
  const paginatedData = merged.slice(skip, skip + limit);

  return {
    isSingle: false,
    data: paginatedData,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};

export const getSingleAdminStaff = async (staffId, requester, options = {}) => {
  const { skipPermissionCheck = false } = options;
  let staff = await StaffRepo.findAdminStaffById(staffId);
  let isFranchiseAdmin = false;

  if (!staff) {
    staff = await StaffRepo.findFranchiseAdminById(staffId);
    isFranchiseAdmin = Boolean(staff);
  }

  if (!staff) {
    throw new ApiError(404, "Admin staff not found");
  }

  if (!skipPermissionCheck) {
    // Check permission
    const isAllowed =
      requester?.role === "ADMIN" ||
      requester?.role === "SUPER_ADMIN" ||
      (requester?.role === "ADMIN_STAFF" &&
        staff._id.toString() === requester?._id?.toString()) ||
      (requester?.role === "FRANCHISE_ADMIN" &&
        staff._id.toString() === requester?._id?.toString());

    if (!isAllowed) {
      throw new ApiError(403, "You are not allowed to view this staff");
    }
  }

  if (isFranchiseAdmin) {
    return {
      ...staff.toObject(),
      status: staff.status || "ACTIVE",
    };
  }

  const statusDoc = await StaffStatus.findOne({ staffId: staff._id });

  return {
    ...staff.toObject(),
    status: statusDoc ? statusDoc.status : "ACTIVE",
  };
};



export const updateAdminStaff = async (staffId, payload) => {
  const staff = await StaffRepo.findById(staffId);
  if (!staff) throw new ApiError(404, "Admin staff not found");

  let currentStatus = "ACTIVE";

  // Handle Status Update
  if (payload.status) {
    const statusDoc = await StaffStatus.findOneAndUpdate(
      { staffId: staff._id },
      { status: payload.status },
      { upsert: true, new: true }
    );
    currentStatus = statusDoc.status;

    if (payload.status === "TERMINATED") {
      await LogoutRepo.clearSession(staff._id);
    }
  } else {
    const statusDoc = await StaffStatus.findOne({ staffId: staff._id });
    if (statusDoc) currentStatus = statusDoc.status;
  }

  const { status, ...updateData } = payload;
  const updatedStaff = await StaffRepo.updateById(staffId, updateData);

  return {
    ...updatedStaff.toObject(),
    status: currentStatus,
  };
};

export const deleteAdminStaff = async (staffId) => {
  const staff = await StaffRepo.findById(staffId);
  if (!staff) throw new ApiError(404, "Admin staff not found");

  return StaffRepo.deleteById(staffId);
};
