import ApiError from "../../utils/ApiError.js";
import Admin from "../../models/auth/auth.model.js";
import FranchiseAdmin from "../../models/Franchise/franchiseAdmin.model.js";
import StaffStatus from "../../models/staff/Staff.model.js";

export const loginUser = async ({
  email,
  password,
  fcmToken,
  deviceId,
}) => {

  // 1️⃣ Try Admin / Staff login
  let user = await Admin.findOne({ email }).select("+password");
  let isFranchise = false;

  // 2️⃣ If not found → try Franchise Admin
  if (!user) {
    user = await FranchiseAdmin.findOne({ email }).select("+password");
    isFranchise = true;
  }

  if (!user) throw new ApiError(401, "Invalid credentials");

  // 🔐 PASSWORD CHECK
  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new ApiError(401, "Invalid credentials");

  // 3️⃣ STAFF STATUS CHECK (only for admin staff)
  if (!isFranchise && user.role === "ADMIN_STAFF") {

    const staffStatus = await StaffStatus.findOne({ staffId: user._id });

    if (!staffStatus) {
      throw new ApiError(403, "Staff status not found");
    }

    if (staffStatus.status === "TERMINATED") {
      throw new ApiError(403, "Your account is terminated. Contact admin.");
    }

    if (staffStatus.status === "INACTIVE") {
      throw new ApiError(403, "Your account is inactive. Ask admin to activate.");
    }

    await StaffStatus.updateOne(
      { staffId: user._id },
      { status: "ACTIVE" }
    );
  }

  // 🔑 TOKEN GENERATION
  const accessToken = user.generateAccessToken
    ? user.generateAccessToken()
    : null;

  const refreshToken = user.generateRefreshToken
    ? user.generateRefreshToken()
    : null;

  user.refreshToken = refreshToken;

  // 🔔 FCM TOKEN HANDLING
  if (fcmToken && deviceId) {

    if (!user.fcmTokens) user.fcmTokens = [];

    const existingDevice = user.fcmTokens.find(
      (d) => d.deviceId === deviceId
    );

    if (existingDevice) {
      existingDevice.token = fcmToken;
      existingDevice.lastUsedAt = new Date();
    } else {
      user.fcmTokens.push({
        token: fcmToken,
        deviceId,
        lastUsedAt: new Date(),
      });
    }
  }

  await user.save({ validateBeforeSave: false });

  const userObject = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    fcmTokens: user.fcmTokens || [],
  };

  if (isFranchise) {
    userObject.accountId = user.accountId;
  }

  return {
    user: userObject,
    currentFcmToken: fcmToken,
    accessToken,
    refreshToken,
  };
};