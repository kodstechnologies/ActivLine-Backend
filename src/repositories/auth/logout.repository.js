import Admin from "../../models/auth/auth.model.js";
import FranchiseAdmin from "../../models/Franchise/franchiseAdmin.model.js";

// find user
export const findUserById = async (userId) => {
  const adminUser = await Admin.findById(userId);
  if (adminUser) return adminUser;

  return FranchiseAdmin.findById(userId);
};

// remove only specific FCM token
export const removeFCMToken = async (userId, fcmToken) => {
  const update = { $pull: { fcmTokens: { token: fcmToken } } };

  // Support both Admin and FranchiseAdmin collections (idempotent)
  await Promise.all([
    Admin.findByIdAndUpdate(userId, update),
    FranchiseAdmin.findByIdAndUpdate(userId, update),
  ]);
};

// clear full session (normal logout)
export const clearSession = async (userId) => {
  const update = {
    refreshToken: null,
    fcmTokens: [],
  };

  // Support both Admin and FranchiseAdmin collections (idempotent)
  await Promise.all([
    Admin.findByIdAndUpdate(userId, update),
    FranchiseAdmin.findByIdAndUpdate(userId, update),
  ]);
};
