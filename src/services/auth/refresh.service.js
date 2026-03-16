import jwt from "jsonwebtoken";
import ApiError from "../../utils/ApiError.js";
import Admin from "../../models/auth/auth.model.js";
import FranchiseAdmin from "../../models/Franchise/franchiseAdmin.model.js";

const findUserByIdAcrossCollections = async (userId) => {
  const adminUser = await Admin.findById(userId);
  if (adminUser) return adminUser;
  return FranchiseAdmin.findById(userId);
};

export const refreshAccessToken = async ({ refreshToken }) => {
  if (!refreshToken) {
    throw new ApiError(401, "Refresh token is required");
  }
  if (!process.env.REFRESH_TOKEN_SECRET) {
    throw new ApiError(500, "REFRESH_TOKEN_SECRET is missing");
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch (_err) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const userId = decoded?._id || decoded?.id;
  if (!userId) {
    throw new ApiError(401, "Invalid refresh token payload");
  }

  const user = await findUserByIdAcrossCollections(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!user.refreshToken || user.refreshToken !== refreshToken) {
    throw new ApiError(401, "Refresh token mismatch");
  }

  const accessToken = user.generateAccessToken ? user.generateAccessToken() : null;
  if (!accessToken) {
    throw new ApiError(500, "Failed to generate access token");
  }

  return { accessToken, user };
};

