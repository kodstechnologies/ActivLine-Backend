import Admin from "../../models/auth/auth.model.js";
import FranchiseAdmin from "../../models/Franchise/franchiseAdmin.model.js";
import StaffStatus from "../../models/staff/Staff.model.js";
import ChatRoom from "../../models/chat/chatRoom.model.js";
import mongoose from "mongoose";

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

export const getAssignedStaffStatusStats = async (staffId = null) => {
  const match = {
    assignedStaff: { $ne: null },
  };

  if (staffId) {
    match.assignedStaff = new mongoose.Types.ObjectId(String(staffId));
  }

  return ChatRoom.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: "$assignedStaff",
        totalAssigned: { $sum: 1 },
        assigned: {
          $sum: { $cond: [{ $eq: ["$status", "ASSIGNED"] }, 1, 0] },
        },
        open: {
          $sum: { $cond: [{ $eq: ["$status", "OPEN"] }, 1, 0] },
        },
        inProgress: {
          $sum: { $cond: [{ $eq: ["$status", "IN_PROGRESS"] }, 1, 0] },
        },
        resolved: {
          $sum: { $cond: [{ $eq: ["$status", "RESOLVED"] }, 1, 0] },
        },
        closed: {
          $sum: { $cond: [{ $eq: ["$status", "CLOSED"] }, 1, 0] },
        },
        lastAssignedAt: { $max: "$updatedAt" },
      },
    },
    {
      $lookup: {
        from: "admins",
        localField: "_id",
        foreignField: "_id",
        as: "staff",
      },
    },
    {
      $unwind: "$staff",
    },
    {
      $project: {
        _id: 0,
        staffId: "$_id",
        staff: {
          _id: "$staff._id",
          name: "$staff.name",
          email: "$staff.email",
          role: "$staff.role",
          createdAt: "$staff.createdAt",
          updatedAt: "$staff.updatedAt",
        },
        totalAssigned: 1,
        assigned: 1,
        open: 1,
        inProgress: 1,
        resolved: 1,
        closed: 1,
        lastAssignedAt: 1,
      },
    },
    {
      $sort: {
        lastAssignedAt: -1,
      },
    },
  ]);
};

export const getLatestAssignedRooms = async (limit = 5, staffId = null) => {
  const query = { assignedStaff: { $ne: null } };
  if (staffId) {
    query.assignedStaff = new mongoose.Types.ObjectId(String(staffId));
  }

  return ChatRoom.find(query)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .populate("assignedStaff", "name email role")
    .populate("customer", "userName firstName lastName emailId accountId");
};

export const getAssignedCustomerIds = async (staffId = null) => {
  const query = { assignedStaff: { $ne: null } };
  if (staffId) {
    query.assignedStaff = new mongoose.Types.ObjectId(String(staffId));
  }
  return ChatRoom.distinct("customer", query);
};

export const getAssignedCustomerStats = async (staffId = null) => {
  const match = { assignedStaff: { $ne: null } };
  if (staffId) {
    match.assignedStaff = new mongoose.Types.ObjectId(String(staffId));
  }

  return ChatRoom.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$customer",
        assignedTicketCount: { $sum: 1 },
        lastAssignedAt: { $max: "$updatedAt" },
      },
    },
  ]);
};
