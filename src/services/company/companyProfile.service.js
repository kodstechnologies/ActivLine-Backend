import ApiError from "../../utils/ApiError.js";
import CompanyProfile from "../../models/company/companyProfile.model.js";

const normalizeEmail = (email) => String(email).trim().toLowerCase();

export const getMyCompanyProfile = async (user) => {
  const profile = await CompanyProfile.findOne({
    ownerId: user._id,
    ownerRole: user.role,
  });

  if (!profile) {
    throw new ApiError(404, "Company profile not found");
  }

  return profile;
};

export const createMyCompanyProfile = async (user, payload) => {
  const exists = await CompanyProfile.findOne({
    ownerId: user._id,
    ownerRole: user.role,
  }).select("_id");

  if (exists) {
    throw new ApiError(409, "Company profile already exists");
  }

  const profile = await CompanyProfile.create({
    ownerId: user._id,
    ownerRole: user.role,
    companyName: String(payload.companyName).trim(),
    email: normalizeEmail(payload.email),
    address: String(payload.address).trim(),
  });

  return profile;
};

export const updateMyCompanyProfile = async (user, payload) => {
  const profile = await CompanyProfile.findOne({
    ownerId: user._id,
    ownerRole: user.role,
  });

  if (!profile) {
    throw new ApiError(404, "Company profile not found");
  }

  if (payload.companyName && String(payload.companyName).trim()) {
    profile.companyName = String(payload.companyName).trim();
  }

  if (payload.email && String(payload.email).trim()) {
    profile.email = normalizeEmail(payload.email);
  }

  if (payload.address && String(payload.address).trim()) {
    profile.address = String(payload.address).trim();
  }

  await profile.save();

  return profile;
};

export const deleteMyCompanyProfile = async (user) => {
  const profile = await CompanyProfile.findOneAndDelete({
    ownerId: user._id,
    ownerRole: user.role,
  });

  if (!profile) {
    throw new ApiError(404, "Company profile not found");
  }

  return profile;
};
