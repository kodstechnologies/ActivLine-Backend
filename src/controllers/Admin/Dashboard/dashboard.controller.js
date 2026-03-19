import { asyncHandler } from "../../../utils/AsyncHandler.js";
import ApiResponse from "../../../utils/ApiReponse.js";
import * as DashboardService from "../../../services/admin/Dashboard/dashboard.service.js";
import * as StaffService from "../../../services/staff/adminStaff.manage.service.js";
import Customer from "../../../models/Customer/customer.model.js";

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

const resolvePlanNameFromDetails = (planDetails, fallback) => {
  if (!planDetails || typeof planDetails !== "object") return fallback;

  const direct =
    normalizeText(planDetails.name) ||
    normalizeText(planDetails.planName) ||
    normalizeText(planDetails.profileName);
  if (direct) return direct;

  const billingRows = Array.isArray(planDetails["billing Details"])
    ? planDetails["billing Details"]
    : [];
  const profileRows = Array.isArray(planDetails["profile Details"])
    ? planDetails["profile Details"]
    : [];

  const fromBilling = billingRows.find(
    (row) => String(row?.property || "").toLowerCase() === "description"
  );
  const billingDesc = normalizeText(fromBilling?.value);
  if (billingDesc) return billingDesc;

  const fromProfile = profileRows.find(
    (row) => String(row?.property || "").toLowerCase() === "package type"
  );
  const profileVal = normalizeText(fromProfile?.value);
  if (profileVal) return profileVal;

  return fallback;
};

const resolvePlanName = (paymentObj) => {
  const raw = normalizeText(paymentObj?.planName);
  const fallback = raw;
  const candidate = resolvePlanNameFromDetails(paymentObj?.planDetails, fallback);

  if (!raw) return candidate;
  if (!candidate) return raw;
  if (raw.toLowerCase().startsWith("plan_")) return candidate;
  return raw;
};

const buildCustomerResolver = async (payments) => {
  const keySet = new Set();

  for (const item of payments || []) {
    [item?.accountId, item?.groupId, item?.profileId].forEach((value) => {
      const key = normalizeText(value);
      if (key) keySet.add(key);
    });
  }

  const keys = Array.from(keySet);
  if (!keys.length) return () => null;

  const numericGroupIds = keys
    .map((key) => Number(key))
    .filter((num) => Number.isFinite(num));

  const customers = await Customer.find({
    $or: [
      { accountId: { $in: keys } },
      { activlineUserId: { $in: keys } },
      { userGroupId: { $in: numericGroupIds } },
    ],
  })
    .select("userName firstName lastName accountId userGroupId activlineUserId")
    .sort({ updatedAt: -1 })
    .lean();

  const byAccountId = new Map();
  const byGroupId = new Map();
  const byActivlineUserId = new Map();

  for (const customer of customers) {
    const accountKey = normalizeText(customer.accountId);
    const groupKey = normalizeText(customer.userGroupId);
    const profileKey = normalizeText(customer.activlineUserId);

    if (accountKey && !byAccountId.has(accountKey)) byAccountId.set(accountKey, customer);
    if (groupKey && !byGroupId.has(groupKey)) byGroupId.set(groupKey, customer);
    if (profileKey && !byActivlineUserId.has(profileKey)) {
      byActivlineUserId.set(profileKey, customer);
    }
  }

  return (payment) => {
    const accountId = normalizeText(payment?.accountId);
    const groupId = normalizeText(payment?.groupId);
    const profileId = normalizeText(payment?.profileId);

    return (
      (accountId && byAccountId.get(accountId)) ||
      (profileId && byActivlineUserId.get(profileId)) ||
      (groupId && byGroupId.get(groupId)) ||
      null
    );
  };
};

/* OPEN */
export const getOpenTickets = asyncHandler(async (req, res) => {
  const data = await DashboardService.getOpenTickets();
  res.json(ApiResponse.success(data, "Open tickets fetched"));
});

/* IN PROGRESS */
export const getInProgressTickets = asyncHandler(async (req, res) => {
  const data = await DashboardService.getInProgressTickets();
  res.json(ApiResponse.success(data, "In-progress tickets fetched"));
});

/* TODAY RESOLVED */
export const getTodayResolvedTickets = asyncHandler(async (req, res) => {
  const data = await DashboardService.getTodayResolvedTickets();
  res.json(ApiResponse.success(data, "Today resolved tickets fetched"));
});

/* TOTAL CUSTOMERS */
export const getTotalCustomers = asyncHandler(async (req, res) => {
  const data = await DashboardService.getTotalCustomers();
  res.json(ApiResponse.success(data, "Total customers fetched"));
});

/* RECENT TICKETS */
export const getRecentTickets = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 5;
  const rooms = await DashboardService.getRecentTickets(limit);

  const mapped = rooms.map((room) => ({
    ticketId: room._id,
    subject: "Customer Support Chat",
    customer:
      room.customer?.userName ||
      `${room.customer?.firstName || ""} ${room.customer?.lastName || ""}`.trim() ||
      room.customer?.emailId ||
      room.customer?.email ||
      "Unknown",
    status: room.status,
    createdAt: room.createdAt,
  }));

  res.json(ApiResponse.success(mapped, "Recent tickets fetched"));
});

/* RECENT PAYMENTS */
export const getRecentPayments = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);
  const payments = await DashboardService.getRecentPayments(limit);
  const resolveCustomer = await buildCustomerResolver(payments);

  const mapped = payments.map((item) => {
    const resolvedPlanName = resolvePlanName(item);
    const customer = resolveCustomer(item);
    const userName =
      customer?.userName ||
      `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim() ||
      null;

    return {
      paymentId: String(item._id),
      orderId: item.razorpayOrderId,
    razorpayPaymentId: item.razorpayPaymentId,
    status: item.status,
    isPaid: item.status === "SUCCESS",
    amount: item.planAmount,
    currency: item.currency,
    groupId: item.groupId,
    accountId: item.accountId,
      profileId: item.profileId,
      planName: resolvedPlanName,
      paidAt: item.paidAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      userName,
      plan: {
        profileId: item.profileId,
        planName: resolvedPlanName,
        planAmount: item.planAmount,
      details: item.planDetails || {},
    },
    };
  });

  res.json(ApiResponse.success(mapped, "Recent payments fetched"));
});

export const getAssignedRoomsCount = asyncHandler(async (req, res) => {
  const data = await DashboardService.getAssignedRoomsCount();

  res.json(
    ApiResponse.success(data, "Assigned rooms count fetched")
  );
});

export const getReportSummary = asyncHandler(async (req, res) => {
  let { groupId, accountId, months } = req.query;

  if (req.user?.role === "FRANCHISE_ADMIN") {
    if (!req.user.accountId) {
      return res.status(403).json(
        ApiResponse.error("Access denied", null)
      );
    }

    if (accountId && String(accountId) !== String(req.user.accountId)) {
      return res.status(403).json(
        ApiResponse.error("Access denied", null)
      );
    }

    accountId = req.user.accountId;
  }

  const data = await DashboardService.getReportSummary({
    groupId,
    accountId,
    months,
  });

  res.json(ApiResponse.success(data, "Report summary fetched"));
});

export const getGlobalGraphSummary = asyncHandler(async (req, res) => {
  const { months } = req.query;
  const data = await DashboardService.getGlobalGraphSummary({ months });

  res.json(ApiResponse.success(data, "Global graph summary fetched"));
});

export const getAssignedCustomersForStaff = asyncHandler(async (req, res) => {
  const data = await StaffService.getStaffGraphSummary(req.user, req.query || {});

  res.json(ApiResponse.success(data, "Staff graph summary fetched"));
});
