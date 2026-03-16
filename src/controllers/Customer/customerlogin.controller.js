import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiError from "../../utils/ApiError.js";
import Customer from "../../models/Customer/customer.model.js";
import CustomerSession from "../../models/Customer/customerLogin.model.js";
import crypto from "crypto";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../../utils/customerTokens.js";
import jwt from "jsonwebtoken";
import { createActivityLog } from "../../services/ActivityLog/activityLog.service.js";

export const customerLogin = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body || {};

  if (!identifier || !password) {
    throw new ApiError(400, "Identifier and password are required");
  }

  // 1️⃣ Find customer
  const customer = await Customer.findOne({
    $or: [{ userName: identifier }, { phoneNumber: identifier }],
  });

  if (!customer) {
    throw new ApiError(401, "Invalid credentials");
  }

  // 2️⃣ Validate password
  const isPasswordValid = await customer.comparePassword(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

  // 3️⃣ Device ID
  const deviceId =
    req.headers["x-device-id"] || crypto.randomBytes(8).toString("hex");

  // 4️⃣ Tokens
  const accessToken = generateAccessToken(customer, deviceId);
  const refreshToken = generateRefreshToken(customer, deviceId);

  // 5️⃣ Save refresh token (per device)
  await CustomerSession.findOneAndUpdate(
    { customerId: customer._id, deviceId },
    {
      refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      lastUsedAt: new Date(),
    },
    { upsert: true }
  );

  await createActivityLog({
    req,
    user: { _id: customer._id, role: "CUSTOMER" },
    action: "LOGIN",
    module: "AUTH",
    description: `Customer ${customer.firstName || customer.userName || customer._id} logged in`,
    targetId: customer._id,
  });

  // 6️⃣ Response
  res
    .cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 30 * 60 * 1000, // 30 minutes
    })
    .cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .status(200)
    .json({
      success: true,
      message: "Login successful",
      deviceId,
    //   userId: customer._id,
      userId: customer.activlineUserId,
      accessToken,
      refreshToken,
    //   customer: {
    //     fullName: customer.fullName,
    //   },
    });

});
// src/controllers/auth/customerAuth.controller.js


/**
 * =========================
 * REFRESH ACCESS TOKEN
 * =========================
 */
export const refreshAccessToken = asyncHandler(async (req, res) => {
  // ✅ Prefer BODY (as you requested)
  const refreshToken =
    req.body?.refreshToken ||
    req.cookies?.refreshToken ||
    req.headers["x-refresh-token"];

  if (!refreshToken) {
    throw new ApiError(401, "Refresh token required");
  }

  // 1️⃣ Verify refresh token
  let decoded;
  try {
    decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  } catch {
    throw new ApiError(401, "Invalid refresh token");
  }

  // 2️⃣ Check DB session (MOST IMPORTANT)
  const session = await CustomerSession.findOne({
    customerId: decoded._id,
    deviceId: decoded.deviceId,
    refreshToken,
  });

  if (!session) {
    throw new ApiError(401, "Session expired. Login again");
  }

  // 3️⃣ Get customer
  const customer = await Customer.findById(decoded._id);
  if (!customer) {
    throw new ApiError(401, "Customer not found");
  }

  // 4️⃣ Generate NEW tokens (Access + Refresh) & update session
  const newAccessToken = generateAccessToken(customer, decoded.deviceId);
  const newRefreshToken = generateRefreshToken(customer, decoded.deviceId);

  // 5️⃣ Atomically update the session with the new refresh token
  session.refreshToken = newRefreshToken;
  session.lastUsedAt = new Date();
  await session.save();

  // 6️⃣ Send response (cookie + body)
  res
    .cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 30 minutes
    })
    .cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
     maxAge: 10 * 24 * 60 * 60 * 1000, // 7 days
    })
    .status(200)
    .json({
      success: true,
      message: "Access token refreshed",
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
});




export const customerLogout = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const tokenDeviceId = req.user.deviceId;
  const tokenRole = req.user.role;

  const bodyDeviceId = req.body?.deviceId;

  // 1️⃣ Role safety (double protection)
  if (tokenRole !== "CUSTOMER") {
    throw new ApiError(403, "Invalid role for logout");
  }

  // 2️⃣ DeviceId decision
  const deviceId = bodyDeviceId || tokenDeviceId;

  if (!deviceId) {
    throw new ApiError(400, "deviceId is required");
  }

  // 3️⃣ 🔥 CRITICAL CHECK: BODY vs TOKEN DEVICE
  if (bodyDeviceId && bodyDeviceId !== tokenDeviceId) {
    throw new ApiError(
      403,
      "Device mismatch. You can only logout your own device"
    );
  }

  // 4️⃣ Delete ONLY that customer + device session
  const result = await CustomerSession.deleteOne({
    customerId: userId,
    deviceId,
  });

  await createActivityLog({
    req,
    user: req.user,
    action: "LOGOUT",
    module: "AUTH",
    description: "Customer logged out",
    targetId: userId,
    metadata: {
      deviceId,
      sessionRemoved: result.deletedCount === 1,
    },
  });

  // 5️⃣ Clear cookies (browser safety)
  res
    .clearCookie("accessToken", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    })
    .clearCookie("refreshToken", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    })
    .status(200)
    .json({
      success: true,
      message: "Logged out successfully",
      deviceId,
      sessionRemoved: result.deletedCount === 1,
    });
});
