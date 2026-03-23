import mongoose from "mongoose";
import Customer from "../../models/Customer/customer.model.js";
import ChatRoom from "../../models/chat/chatRoom.model.js";
import { createCustomerSchema } from "../../validations/Customer/customer.validation.js";
import {
  createCustomerService,
  updateCustomerService,
} from "../../services/Customer/customer.service.js";
import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiError from "../../utils/ApiError.js";
import ApiResponse from "../../utils/ApiReponse.js";
import { sendCustomerWelcomeEmail } from "../../utils/mail.util.js";
import { createActivityLog } from "../../services/ActivityLog/activityLog.service.js";
import { notifyFranchiseAdmins } from "../../services/Notification/franchise.notification.service.js";

/**
 * @description Get all customers with filtering, searching, and pagination
 * @route GET /api/customer/customers
 * @access Private (ADMIN, SUPER_ADMIN, FRANCHISE_ADMIN)
 */
export const getCustomers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    userGroupId, // for plan-wise filtering
    accountId, // account-wise filtering (admin only)
    userType, // plan type: home/business (stored in userType)
    search, // for name search
  } = req.query;

  const filter = {};

  // Scope results for franchise admins
  if (req.user?.role === "FRANCHISE_ADMIN") {
    filter.accountId = req.user.accountId;
  }

  // Scope results for admin staff (only customers assigned to this staff)
  if (req.user?.role === "ADMIN_STAFF") {
    const assignedCustomerIds = await ChatRoom.distinct("customer", {
      assignedStaff: req.user._id,
      customer: { $ne: null },
    });
    filter._id = { $in: assignedCustomerIds };
  }

  // Add status filter if provided
  if (status) {
    filter.status = status.toUpperCase();
  }

  // Add plan (userGroupId) filter if provided
  if (userGroupId) {
    filter.userGroupId = userGroupId;
  }

  // Add accountId filter for admins/super admins
  if (accountId && req.user?.role !== "FRANCHISE_ADMIN") {
    filter.accountId = accountId;
  }

  // Add plan type filter (home/business)
  if (userType) {
    filter.userType = userType;
  }

  // Add search functionality for name fields
  if (search) {
    const searchRegex = new RegExp(search, "i"); // case-insensitive regex
    filter.$or = [
      { firstName: { $regex: searchRegex } },
      { lastName: { $regex: searchRegex } },
      { userName: { $regex: searchRegex } },
      { phoneNumber: { $regex: searchRegex } },
      { emailId: { $regex: searchRegex } },
      { accountId: { $regex: searchRegex } },
    ];
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [customers, totalCustomers] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    Customer.countDocuments(filter),
  ]);

  return res
    .status(200)
    .json(
      ApiResponse.success(customers, "Customers fetched successfully", {
        page: pageNum,
        limit: limitNum,
        total: totalCustomers,
        totalPages: Math.ceil(totalCustomers / limitNum),
      })
    );
});

/**
 * @description Get a single customer by its ID
 * @route GET /api/customer/customers/:customerId
 * @access Private (ADMIN, SUPER_ADMIN, FRANCHISE_ADMIN)
 */
export const getCustomerById = asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new ApiError(400, "Invalid Customer ID format");
  }

  const customer = await Customer.findById(customerId);

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  // Security check: A franchise admin can only view customers from their own franchise.
  if (req.user?.role === "FRANCHISE_ADMIN" && customer.accountId !== req.user.accountId) {
    throw new ApiError(403, "Access Denied. You can only view customers from your franchise.");
  }

  // Security check: Admin staff can only view customers assigned to them
  if (req.user?.role === "ADMIN_STAFF") {
    const assigned = await ChatRoom.exists({
      assignedStaff: req.user._id,
      customer: customer._id,
    });

    if (!assigned) {
      throw new ApiError(403, "Access Denied. You can only view customers assigned to you.");
    }
  }

  return res
    .status(200)
    .json(ApiResponse.success(customer, "Customer details fetched successfully"));
});

/**
 * @description Create a new customer
 * @route POST /api/customer/create
 * @access Public (or Admin if protected by route middleware)
 */
export const createCustomer = asyncHandler(async (req, res) => {
  const { error, value } = createCustomerSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw new ApiError(
      400,
      error.details.map((detail) => detail.message).join(", ")
    );
  }

  const result = await createCustomerService(value, req.files);

  const customerData = result.customer?.toObject
    ? result.customer.toObject()
    : result.customer;

  if (customerData?.password) {
    delete customerData.password;
  }

  if (!customerData.installationAddress) {
    customerData.installationAddress = {
      line1: null,
      line2: null,
      city: null,
      pin: null,
      state: null,
      country: null,
    };
  }

  if (value.emailId) {
    await sendCustomerWelcomeEmail({
      to: value.emailId,
      userName: result.credentials.userName,
      password: result.credentials.password,
      phoneNumber: value.phoneNumber,
      emailId: value.emailId,
    });
  }

  await createActivityLog({
    req,
    user: req.user || { _id: result.customer?._id, role: "CUSTOMER" },
    action: "CREATE",
    module: "CUSTOMER",
    description: req.user
      ? `Customer created by ${req.user.role}`
      : "Customer self-registered",
    targetId: result.customer?._id || null,
    metadata: {
      customerId: result.customer?._id || null,
      accountId: result.customer?.accountId || null,
      createdByRole: req.user?.role || "CUSTOMER",
    },
  });
  try {
    await notifyFranchiseAdmins({
      accountId: result.customer?.accountId || null,
      title: "New Customer Created",
      message: `Customer ${result.customer?.userName || "Unknown"} created`,
      data: {
        customerId: result.customer?._id?.toString() || null,
        activlineUserId: result.customer?.activlineUserId || null,
      },
    });
  } catch (err) {
    console.error("Franchise notification failed:", err?.message);
  }

  return res.status(201).json(
    ApiResponse.success(
      null,
      "Your account is created in ActivLine"
    )
  );
});

/**
 * @description Update customer by Activline userId
 * @route POST /api/customer/update/:activlineUserId
 * @access Private (ADMIN, SUPER_ADMIN, FRANCHISE_ADMIN)
 */
export const updateCustomer = asyncHandler(async (req, res) => {
  const { activlineUserId } = req.params;

  if (!activlineUserId) {
    throw new ApiError(400, "activlineUserId is required");
  }

  const existing = await Customer.findOne({ activlineUserId });

  if (!existing) {
    throw new ApiError(404, "Customer not found");
  }

  if (
    req.user?.role === "FRANCHISE_ADMIN" &&
    existing.accountId !== req.user.accountId
  ) {
    throw new ApiError(
      403,
      "Access Denied. You can only update customers from your franchise."
    );
  }

  const updatedCustomer = await updateCustomerService(
    activlineUserId,
    req.body || {},
    req.files || {}
  );

  await createActivityLog({
    req,
    action: "UPDATE",
    module: "CUSTOMER",
    description: `Customer updated by ${req.user?.role || "ADMIN"}`,
    targetId: existing._id,
    metadata: {
      activlineUserId: activlineUserId,
      updatedFields: Object.keys(req.body || {}),
    },
  });
  try {
    await notifyFranchiseAdmins({
      accountId: result.customer?.accountId || null,
      title: "New Customer Created",
      message: `Customer ${result.customer?.userName || "Unknown"} created`,
      data: {
        customerId: result.customer?._id?.toString() || null,
        activlineUserId: result.customer?.activlineUserId || null,
      },
    });
  } catch (err) {
    console.error("Franchise notification failed:", err?.message);
  }

  return res
    .status(200)
    .json(ApiResponse.success(updatedCustomer, "Customer updated successfully"));
});

