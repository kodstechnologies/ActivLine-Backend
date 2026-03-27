import Admin from "../../models/auth/auth.model.js";
import FranchiseAdmin from "../../models/Franchise/franchiseAdmin.model.js";

const resolveModel = (model) =>
  model === "FRANCHISE_ADMIN" ? FranchiseAdmin : Admin;

export const findUserByEmail = async (email) => {
  const admin = await Admin.findOne({ email });
  if (admin) {
    return { user: admin, model: "ADMIN" };
  }

  const franchise = await FranchiseAdmin.findOne({ email });
  if (franchise) {
    return { user: franchise, model: "FRANCHISE_ADMIN" };
  }

  return null;
};

export const saveOTP = (userId, otp, model = "ADMIN") => {
  const Model = resolveModel(model);
  return Model.findByIdAndUpdate(userId, {
    resetOTP: otp,
    resetOTPExpiry: Date.now() + 5 * 60 * 1000,
  });
};

export const findValidOTPUser = async (email, otp) => {
  const admin = await Admin.findOne({
    email,
    resetOTP: otp,
    resetOTPExpiry: { $gt: Date.now() },
  });
  if (admin) {
    return { user: admin, model: "ADMIN" };
  }

  const franchise = await FranchiseAdmin.findOne({
    email,
    resetOTP: otp,
    resetOTPExpiry: { $gt: Date.now() },
  });
  if (franchise) {
    return { user: franchise, model: "FRANCHISE_ADMIN" };
  }

  return null;
};

export const updatePassword = async (userId, password, model = "ADMIN") => {
  const Model = resolveModel(model);
  const user = await Model.findById(userId);
  if (!user) return null;

  user.password = password; // ✅ triggers pre("save")
  user.resetOTP = null;
  user.resetOTPExpiry = null;

  await user.save(); // 🔥 password gets hashed
};
