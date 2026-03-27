import ApiError from "../../../utils/ApiError.js";
import * as AdminRepo from "../../../repositories/auth/auth.profile.repository.js";
import FranchiseAdmin from "../../../models/Franchise/franchiseAdmin.model.js";
import StaffStatus from "../../../models/staff/Staff.model.js";

export const createAdminStaff = async (payload) => {
  const normalizedEmail = String(payload.email || "").trim().toLowerCase();
  const exists = await AdminRepo.findByEmail(normalizedEmail);
  if (exists) {
    throw new ApiError(409, "User with email already exists");
  }

  const franchiseExists = await FranchiseAdmin.findOne({ email: normalizedEmail }).select("_id");
  if (franchiseExists) {
    throw new ApiError(409, "User with email already exists");
  }

  const user = await AdminRepo.createAuth({
    name: payload.name,
    email: normalizedEmail,
    password: payload.password,

    // ✅ ROLE FROM PAYLOAD
    role: payload.role,

    phone: payload.phone || null,
    fcmToken: payload.fcmToken || null,
    createdBy: payload.createdBy,
  });

  await StaffStatus.create({
    staffId: user._id,
    status: "ACTIVE",
  });

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: "ACTIVE",
    createdAt: user.createdAt,
  };
};

