// import { createCustomerSchema } from "../../validations/Customer/customer.validation.js";

import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import Customer from "../../models/Customer/customer.model.js";
import jwt from "jsonwebtoken";
// import { loginCustomerSchema } from "../../validations/Customer/customer.validation.js";
import { createCustomerService ,updateCustomerService,getMyProfileService,getProfileImageService,
  updateProfileImageService,
  deleteProfileImageService,} from "../../services/Customer/customer.service.js";

import ApiError from "../../utils/ApiError.js";
export const createCustomer = asyncHandler(async (req, res) => {
  const customer = await createCustomerService(req.body, req.files);

  res.status(201).json({
    success: true,
    message: "Customer created successfully",
    data: customer, // 🔥 FULL MODEL HERE
  });
});


export const updateCustomer = asyncHandler(async (req, res) => {
  const { activlineUserId } = req.params;

  const result = await updateCustomerService(
    activlineUserId,
    req.body,
    req.files
  );

  res.status(200).json({
    success: true,
    message: "Customer updated successfully",
    data: result,
  });
});

// export const loginCustomer = async (req, res) => {
//   const { error, value } = loginCustomerSchema.validate(req.body);
//   if (error) throw error;

//   const result = await CustomerService.loginCustomer(value);

//   res.status(200).json(
//     ApiResponse.success(result, "Login successful")
//   );
// };



export const loginCustomer = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      message: "Username/Phone and password are required",
    });
  }

  const user = await Customer.findOne({
    $or: [
      { userName: identifier },
      { phoneNumber: identifier }
    ]
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User does not exist",
    });
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      message: "Invalid user credentials",
    });
  }

  const accessToken = jwt.sign(
    { _id: user._id, role: "CUSTOMER" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1d" }
  );

  const refreshToken = jwt.sign(
    { _id: user._id },
    process.env.REFRESH_TOKEN_SECRET || "refresh-secret",
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "10d" }
  );

  const loggedInUser = await Customer.findById(user._id).select("-password");

  res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      user: loggedInUser,
      accessToken,
      refreshToken,
    },
  });
});



export const getMyProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const profile = await getMyProfileService(userId);

  res.status(200).json({
    success: true,
    message: "Profile fetched successfully",
    data: profile,
  });
});

export const updateCustomerReferralCode = asyncHandler(async (req, res) => {
  const role = req.user.role;

  if (role === "CUSTOMER") {
    throw new ApiError(403, "Access denied");
  }

  const { userName, referralCode, getRewards, giveRewards } = req.body;

  // ✅ Find customer by userName OR referralCode
  let customer;
  if (userName) {
    customer = await Customer.findOne({ userName });
  } else if (referralCode) {
    customer = await Customer.findOne({ "referral.code": referralCode });
  }

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  // ✅ Allow rewards editing (GLOBAL UPDATE)
  const updates = {};
  if (getRewards !== undefined) {
    updates["referral.getRewards"] = getRewards;
    customer.referral.getRewards = getRewards; // Update local for response
  }
  if (giveRewards !== undefined) {
    updates["referral.giveRewards"] = giveRewards;
    customer.referral.giveRewards = giveRewards; // Update local for response
  }

  if (Object.keys(updates).length > 0) {
    await Customer.updateMany({}, { $set: updates });
  }

  res.json({
    success: true,
    message: "Referral rewards updated for all customers",
    data: {
      userName: customer.userName,
      referralCode: customer.referral.code,
      getRewards: customer.referral.getRewards,
      giveRewards: customer.referral.giveRewards,
    }
  });
});





export const deleteCustomerReferralCode = asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  const customer = await Customer.findById(customerId);
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  customer.referral.code = null;
  await customer.save();

  res.json({
    success: true,
    message: "Referral code deleted"
  });
});


export const getMyReferralCode = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const customer = await Customer.findById(userId).select("referral");

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  res.status(200).json({
    success: true,
    data: {
      referralCode: customer.referral?.code || null,
      getRewards: customer.referral?.getRewards,
      giveRewards: customer.referral?.giveRewards,
    },
  });
});


// controllers/Customer/customer.controller.js


export const getProfileImage = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const image = await getProfileImageService(userId);

  res.status(200).json(
    ApiResponse.success(image, "Profile image fetched successfully")
  );
});

export const updateProfileImage = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  if (!req.file) {
    throw new ApiError(400, "Profile image file is required");
  }

  const updated = await updateProfileImageService(userId, req.file);

  res.status(200).json(
    ApiResponse.success(updated, "Profile image updated successfully")
  );
});

export const deleteProfileImage = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  await deleteProfileImageService(userId);

  res.status(200).json(
    ApiResponse.success(null, "Profile image deleted successfully")
  );
});
export const getAllCustomers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const skip = (page - 1) * limit;

  const customers = await Customer.find()
    .select("-password") // 🔐 hide password
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  const totalCustomers = await Customer.countDocuments();

  res.status(200).json({
    success: true,
    message: "Customers fetched successfully",
    data: customers,
    pagination: {
      total: totalCustomers,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(totalCustomers / limit),
    },
  });
});


export const getSingleCustomer = asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  const customer = await Customer.findById(customerId)
    .select("-password"); // 🔐 hide password

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  res.status(200).json({
    success: true,
    message: "Customer fetched successfully",
    data: customer,
  });
});
