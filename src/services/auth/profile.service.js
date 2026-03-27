// src/services/auth/profile.service.js
import ApiError from "../../utils/ApiError.js";
import bcrypt from "bcryptjs";
import * as ProfileRepo from "../../repositories/auth/auth.profile.repository.js";
import FranchiseAdmin from "../../models/Franchise/franchiseAdmin.model.js";

// ✅ GET OWN PROFILE
export const getMyProfile = async (userId) => {
  const user = await ProfileRepo.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return mapProfile(user);
};



export const updateMyProfile = async (userId, payload) => {
  const user = await ProfileRepo.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // ❌ Role is NOT editable
  if (payload.role) {
    throw new ApiError(400, "Role cannot be updated");
  }

  // 🔐 If email is being updated, check uniqueness
  if (payload.email && payload.email !== user.email) {
    const normalizedEmail = String(payload.email).trim().toLowerCase();
    const emailExists = await ProfileRepo.findByEmail(normalizedEmail);
    if (emailExists) {
      throw new ApiError(409, "Email already in use");
    }
    const franchiseExists = await FranchiseAdmin.findOne({ email: normalizedEmail }).select("_id");
    if (franchiseExists) {
      throw new ApiError(409, "Email already in use");
    }
  }

  // 🔐 Hash password if provided
  let hashedPassword;
  if (payload.password) {
    hashedPassword = await bcrypt.hash(payload.password, 10);
  }

  const updatedUser = await ProfileRepo.updateById(userId, {
    name: payload.name ?? user.name,
    email: payload.email ? String(payload.email).trim().toLowerCase() : user.email,
    password: hashedPassword ?? user.password,
    phone: payload.phone ?? user.phone,
    fcmToken: payload.fcmToken ?? user.fcmToken,
  });

  return mapProfile(updatedUser);
};

const mapProfile = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  updatedAt: user.updatedAt,
});
