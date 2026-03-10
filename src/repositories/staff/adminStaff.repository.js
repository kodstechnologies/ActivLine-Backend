import Admin from "../../models/auth/auth.model.js";
import FranchiseAdmin from "../../models/Franchise/franchiseAdmin.model.js";
import StaffStatus from "../../models/staff/Staff.model.js";

const DEFAULT_ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "ADMIN_STAFF"];

const buildSearchFilter = (search) => {
  const term = String(search || "").trim();
  if (!term) return {};

  const regex = new RegExp(term, "i");
  return {
    $or: [{ name: regex }, { email: regex }],
  };
};

export const findAllAdminStaff = async ({ roles = DEFAULT_ADMIN_ROLES, search = "" } = {}) => {
  return Admin.find({
    role: { $in: roles },
    ...buildSearchFilter(search),
  }).select("-password");
};

export const findAllFranchiseAdmins = async ({ search = "" } = {}) => {
  return FranchiseAdmin.find(buildSearchFilter(search)).select("-password");
};


export const findAdminStaffById = async (id) => {
  return Admin.findById(id).select("-password");
};

export const findFranchiseAdminById = async (id) => {
  return FranchiseAdmin.findById(id).select("-password");
};

export const findById = async (id) => {
  return Admin.findById(id);
};

export const updateById = async (id, updateData) => {
  return Admin.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
};

export const deleteById = async (id) => {
  return Admin.findByIdAndDelete(id);
};


export const setStatus = (staffId, status) => {
  return StaffStatus.findOneAndUpdate(
    { staffId },
    { status },
    { upsert: true }
  );
};

export const getStatus = async (staffId) => {
  const statusDoc = await StaffStatus.findOne({ staffId });
  return statusDoc ? statusDoc.status : null;
};
