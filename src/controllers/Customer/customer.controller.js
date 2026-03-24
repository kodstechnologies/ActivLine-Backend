import mongoose from "mongoose";
import Customer from "../../models/Customer/customer.model.js";
import ChatRoom from "../../models/chat/chatRoom.model.js";
import { createCustomerSchema } from "../../validations/Customer/customer.validation.js";
import {
  createCustomerService,
  updateCustomerService,
  getProfileImageService,
  updateProfileImageService,
  deleteProfileImageService,
} from "../../services/Customer/customer.service.js";
import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiError from "../../utils/ApiError.js";
import ApiResponse from "../../utils/ApiReponse.js";
import { sendCustomerWelcomeEmail } from "../../utils/mail.util.js";
import { createActivityLog } from "../../services/ActivityLog/activityLog.service.js";
import { notifyFranchiseAdmins } from "../../services/Notification/franchise.notification.service.js";
import PaymentHistory from "../../models/payment/paymentHistory.model.js";

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

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
 * @description Get full customer overview by username (details, payments, tickets)
 * @route GET /api/customer/customers/username/:userName/overview
 * @access Private (ADMIN, SUPER_ADMIN, FRANCHISE_ADMIN)
 */
export const getCustomerOverviewByUserName = asyncHandler(async (req, res) => {
  const userNameParam = normalizeText(req.params.userName);
  if (!userNameParam) {
    throw new ApiError(400, "userName is required");
  }

  const customer = await Customer.findOne({
    userName: { $regex: `^${escapeRegex(userNameParam)}$`, $options: "i" },
  }).select("-password -rawPayload");

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  if (req.user?.role === "FRANCHISE_ADMIN" && customer.accountId !== req.user.accountId) {
    throw new ApiError(403, "Access Denied. You can only view customers from your franchise.");
  }

  const paymentPage = parseInt(req.query.paymentPage || req.query.page || 1, 10);
  const paymentLimit = Math.min(parseInt(req.query.paymentLimit || req.query.limit || 10, 10), 100);
  const ticketLimit = Math.min(parseInt(req.query.ticketLimit || 10, 10), 100);

  const paymentFilters = {
    $or: [
      customer.accountId ? { accountId: String(customer.accountId) } : null,
      customer.userGroupId ? { groupId: String(customer.userGroupId) } : null,
      customer.activlineUserId ? { profileId: String(customer.activlineUserId) } : null,
    ].filter(Boolean),
  };

  const paymentSkip = (Math.max(paymentPage, 1) - 1) * Math.max(paymentLimit, 1);

  const [payments, paymentTotal, ticketRooms, ticketStatusCounts] = await Promise.all([
    paymentFilters.$or.length
      ? PaymentHistory.find(paymentFilters)
          .sort({ createdAt: -1 })
          .skip(paymentSkip)
          .limit(paymentLimit)
      : Promise.resolve([]),
    paymentFilters.$or.length
      ? PaymentHistory.countDocuments(paymentFilters)
      : Promise.resolve(0),
    ChatRoom.find({ customer: customer._id })
      .select(
        "_id status createdAt updatedAt lastMessage lastMessageAt assignedStaff assignedFranchiseAdmin"
      )
      .populate("assignedStaff", "name email")
      .populate("assignedFranchiseAdmin", "name email accountId role status")
      .sort({ updatedAt: -1 })
      .limit(ticketLimit),
    ChatRoom.aggregate([
      { $match: { customer: customer._id } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const ticketSummary = {
    OPEN: 0,
    ASSIGNED: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    CLOSED: 0,
  };
  ticketStatusCounts.forEach((row) => {
    if (ticketSummary[row._id] !== undefined) {
      ticketSummary[row._id] = row.count;
    }
  });

  return res.json(
    ApiResponse.success(
      {
        customer,
        paymentHistory: {
          page: Math.max(paymentPage, 1),
          limit: Math.max(paymentLimit, 1),
          total: paymentTotal,
          totalPages: paymentTotal === 0 ? 0 : Math.ceil(paymentTotal / paymentLimit),
          data: payments.map((item) => ({
            paymentId: String(item._id),
            orderId: item.razorpayOrderId || null,
            razorpayPaymentId: item.razorpayPaymentId || null,
            status: item.status,
            isPaid: item.status === "SUCCESS",
            amount: item.planAmount,
            currency: item.currency,
            groupId: item.groupId,
            accountId: item.accountId,
            profileId: item.profileId,
            planName: item.planName,
            paidAt: item.paidAt || null,
            createdAt: item.createdAt || null,
            updatedAt: item.updatedAt || null,
            userName: customer.userName || null,
          })),
        },
        tickets: {
          summary: ticketSummary,
          count: ticketRooms.length,
          data: ticketRooms,
        },
      },
      "Customer overview fetched successfully"
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

/**
 * @description Update customer by MongoDB _id (franchise/admin edit)
 * @route PATCH /api/customer/customers/:customerId/franchise-edit
 * @access Private (ADMIN, SUPER_ADMIN, FRANCHISE_ADMIN)
 */
export const updateCustomerByIdForFranchise = asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new ApiError(400, "Invalid Customer ID format");
  }

  const existing = await Customer.findById(customerId);
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
    existing.activlineUserId,
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
      activlineUserId: existing.activlineUserId,
      updatedFields: Object.keys(req.body || {}),
    },
  });

  return res
    .status(200)
    .json(ApiResponse.success(updatedCustomer, "Customer updated successfully"));
});

/**
 * @description Get maintenance dates for a customer
 * @route GET /api/customer/customers/:customerId/maintenance
 * @access Private (ADMIN, SUPER_ADMIN, FRANCHISE_ADMIN)
 */
export const getCustomerMaintenanceDates = asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new ApiError(400, "Invalid Customer ID format");
  }

  const customer = await Customer.findById(customerId).select(
    "_id accountId maintenance"
  );

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  if (
    req.user?.role === "FRANCHISE_ADMIN" &&
    customer.accountId !== req.user.accountId
  ) {
    throw new ApiError(
      403,
      "Access Denied. You can only view customers from your franchise."
    );
  }

  return res.status(200).json(
    ApiResponse.success(
      {
       
        lastDate: customer.maintenance?.lastDate || null,
        endDate: customer.maintenance?.endDate || null,
      },
      "Customer maintenance dates fetched successfully"
    )
  );
});

/**
 * @description Create or update maintenance dates for a customer
 * @route POST/PATCH /api/customer/customers/:customerId/maintenance
 * @access Private (ADMIN, SUPER_ADMIN, FRANCHISE_ADMIN)
 */
export const upsertCustomerMaintenanceDates = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { lastDate, endDate } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new ApiError(400, "Invalid Customer ID format");
  }

  if (!lastDate && !endDate) {
    throw new ApiError(400, "lastDate or endDate is required");
  }

  const customer = await Customer.findById(customerId).select(
    "_id accountId maintenance"
  );

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  if (
    req.user?.role === "FRANCHISE_ADMIN" &&
    customer.accountId !== req.user.accountId
  ) {
    throw new ApiError(
      403,
      "Access Denied. You can only update customers from your franchise."
    );
  }

  const update = {};
  if (lastDate !== undefined) update["maintenance.lastDate"] = lastDate;
  if (endDate !== undefined) update["maintenance.endDate"] = endDate;

  const updatedCustomer = await Customer.findByIdAndUpdate(
  
    { $set: update },
    { new: true }
  ).select("_id maintenance");

  return res.status(200).json(
    ApiResponse.success(
      {
       
        lastDate: updatedCustomer.maintenance?.lastDate || null,
        endDate: updatedCustomer.maintenance?.endDate || null,
      },
      "Customer maintenance dates updated successfully"
    )
  );
});

/**
 * @description Delete maintenance dates for a customer
 * @route DELETE /api/customer/customers/:customerId/maintenance
 * @access Private (ADMIN, SUPER_ADMIN, FRANCHISE_ADMIN)
 */
export const deleteCustomerMaintenanceDates = asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new ApiError(400, "Invalid Customer ID format");
  }

  const customer = await Customer.findById(customerId).select(
    "_id accountId maintenance"
  );

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  if (
    req.user?.role === "FRANCHISE_ADMIN" &&
    customer.accountId !== req.user.accountId
  ) {
    throw new ApiError(
      403,
      "Access Denied. You can only update customers from your franchise."
    );
  }

  const updatedCustomer = await Customer.findByIdAndUpdate(

    { $unset: { "maintenance.lastDate": "", "maintenance.endDate": "" } },
    { new: true }
  ).select("_id maintenance");

  return res.status(200).json(
    ApiResponse.success(
      {
        
        lastDate: updatedCustomer.maintenance?.lastDate || null,
        endDate: updatedCustomer.maintenance?.endDate || null,
      },
      "Customer maintenance dates deleted successfully"
    )
  );
});

/**
 * @description Get maintenance dates by accountId
 * @route GET /api/customer/customers/account/:accountId/maintenance
 * @access Private (ADMIN, SUPER_ADMIN, FRANCHISE_ADMIN, CUSTOMER)
 */
export const getCustomerMaintenanceDatesByAccountId = asyncHandler(
  async (req, res) => {
    const { accountId } = req.params;

    if (!accountId) {
      throw new ApiError(400, "accountId is required");
    }

    if (
      req.user?.role === "FRANCHISE_ADMIN" &&
      String(req.user.accountId) !== String(accountId)
    ) {
      throw new ApiError(
        403,
        "Access Denied. You can only view customers from your franchise."
      );
    }

    if (
      req.user?.role === "CUSTOMER" &&
      String(req.user.accountId) !== String(accountId)
    ) {
      throw new ApiError(403, "Access Denied. Invalid accountId.");
    }

    const customer = await Customer.findOne({ accountId }).select(
      "_id accountId maintenance"
    );

    if (!customer) {
      throw new ApiError(404, "Customer not found");
    }

    return res.status(200).json(
      ApiResponse.success(
        {
          
          accountId: customer.accountId,
          lastDate: customer.maintenance?.lastDate || null,
          endDate: customer.maintenance?.endDate || null,
        },
        "Customer maintenance dates fetched successfully"
      )
    );
  }
);

/**
 * @description Create or update maintenance dates by accountId
 * @route POST/PATCH /api/customer/customers/account/:accountId/maintenance
 * @access Private (ADMIN, SUPER_ADMIN, FRANCHISE_ADMIN, CUSTOMER)
 */
export const upsertCustomerMaintenanceDatesByAccountId = asyncHandler(
  async (req, res) => {
    const { accountId } = req.params;
    const { lastDate, endDate } = req.body || {};

    if (!accountId) {
      throw new ApiError(400, "accountId is required");
    }

    if (!lastDate && !endDate) {
      throw new ApiError(400, "lastDate or endDate is required");
    }

    if (
      req.user?.role === "FRANCHISE_ADMIN" &&
      String(req.user.accountId) !== String(accountId)
    ) {
      throw new ApiError(
        403,
        "Access Denied. You can only update customers from your franchise."
      );
    }

    if (
      req.user?.role === "CUSTOMER" &&
      String(req.user.accountId) !== String(accountId)
    ) {
      throw new ApiError(403, "Access Denied. Invalid accountId.");
    }

    const customer = await Customer.findOne({ accountId }).select(
      "_id accountId maintenance"
    );

    if (!customer) {
      throw new ApiError(404, "Customer not found");
    }

    const update = {};
    if (lastDate !== undefined) update["maintenance.lastDate"] = lastDate;
    if (endDate !== undefined) update["maintenance.endDate"] = endDate;

    const updatedCustomer = await Customer.findOneAndUpdate(
      { accountId },
      { $set: update },
      { new: true }
    ).select("_id accountId maintenance");

    return res.status(200).json(
      ApiResponse.success(
        {
         
          accountId: updatedCustomer.accountId,
          lastDate: updatedCustomer.maintenance?.lastDate || null,
          endDate: updatedCustomer.maintenance?.endDate || null,
        },
        "Customer maintenance dates updated successfully"
      )
    );
  }
);

/**
 * @description Delete maintenance dates by accountId
 * @route DELETE /api/customer/customers/account/:accountId/maintenance
 * @access Private (ADMIN, SUPER_ADMIN, FRANCHISE_ADMIN, CUSTOMER)
 */
export const deleteCustomerMaintenanceDatesByAccountId = asyncHandler(
  async (req, res) => {
    const { accountId } = req.params;

    if (!accountId) {
      throw new ApiError(400, "accountId is required");
    }

    if (
      req.user?.role === "FRANCHISE_ADMIN" &&
      String(req.user.accountId) !== String(accountId)
    ) {
      throw new ApiError(
        403,
        "Access Denied. You can only update customers from your franchise."
      );
    }

    if (
      req.user?.role === "CUSTOMER" &&
      String(req.user.accountId) !== String(accountId)
    ) {
      throw new ApiError(403, "Access Denied. Invalid accountId.");
    }

    const customer = await Customer.findOne({ accountId }).select(
      "_id accountId maintenance"
    );

    if (!customer) {
      throw new ApiError(404, "Customer not found");
    }

    const updatedCustomer = await Customer.findOneAndUpdate(
      { accountId },
      { $unset: { "maintenance.lastDate": "", "maintenance.endDate": "" } },
      { new: true }
    ).select("_id accountId maintenance");

    return res.status(200).json(
      ApiResponse.success(
        {
         
          accountId: updatedCustomer.accountId,
          lastDate: updatedCustomer.maintenance?.lastDate || null,
          endDate: updatedCustomer.maintenance?.endDate || null,
        },
        "Customer maintenance dates deleted successfully"
      )
    );
  }
);

/**
 * @description Get profile image for the authenticated customer
 * @route GET /api/customer/me/profile-image
 * @access Private (CUSTOMER)
 */
export const getMyProfileImage = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "User ID not found in token");
  }

  const data = await getProfileImageService(userId);

  return res
    .status(200)
    .json(ApiResponse.success(data, "Profile image fetched successfully"));
});

/**
 * @description Update profile image for the authenticated customer
 * @route PUT /api/customer/me/profile-image
 * @access Private (CUSTOMER)
 */
export const updateMyProfileImage = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "User ID not found in token");
  }

  const file =
    req.file ||
    req.files?.profilePicFile?.[0] ||
    req.files?.profileImage?.[0];

  if (!file) {
    throw new ApiError(400, "profilePicFile is required");
  }

  const data = await updateProfileImageService(userId, file);

  return res
    .status(200)
    .json(ApiResponse.success(data, "Profile image updated successfully"));
});

/**
 * @description Delete profile image for the authenticated customer
 * @route DELETE /api/customer/me/profile-image
 * @access Private (CUSTOMER)
 */
export const deleteMyProfileImage = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "User ID not found in token");
  }

  await deleteProfileImageService(userId);

  return res
    .status(200)
    .json(ApiResponse.success(null, "Profile image deleted successfully"));
});
