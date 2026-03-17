import ApiError from "../../utils/ApiError.js";
import mongoose from "mongoose";
import * as StaffRepo from "../../repositories/staff/adminStaff.repository.js";
import StaffStatus from "../../models/staff/Staff.model.js";
import * as LogoutRepo from "../../repositories/auth/logout.repository.js";
import Customer from "../../models/Customer/customer.model.js";
import PaymentHistory from "../../models/payment/paymentHistory.model.js";
import ChatRoom from "../../models/chat/chatRoom.model.js";

const ALLOWED_FILTER_ROLES = ["SUPER_ADMIN", "ADMIN", "ADMIN_STAFF", "STAFF", "FRANCHISE_ADMIN"];

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeRoleFilters = (role) => {
  const raw = String(role || "").trim();
  if (!raw) return [];

  const roles = raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .map((item) => (item === "STAFF" ? "ADMIN_STAFF" : item))
    .filter((item) => ALLOWED_FILTER_ROLES.includes(item));

  return [...new Set(roles)];
};

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

const toCustomerSnapshot = (customer) => {
  if (!customer) return null;

  const fullName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
  return {
    _id: customer._id,
    name: customer.userName || fullName || null,
    phoneNumber: customer.phoneNumber || null,
    email: customer.emailId || null,
    accountId: customer.accountId || null,
    userGroupId: customer.userGroupId || null,
    activlineUserId: customer.activlineUserId || null,
  };
};

const resolveCustomerFromMaps = (payment, maps) => {
  const accountId = normalizeText(payment.accountId);
  const groupId = normalizeText(payment.groupId);
  const profileId = normalizeText(payment.profileId);

  return (
    (accountId && maps.byAccountId.get(accountId)) ||
    (groupId && maps.byGroupId.get(groupId)) ||
    (profileId && maps.byProfileId.get(profileId)) ||
    null
  );
};

const mapAdminWithStatus = (admin, statusMap) => ({
  ...admin.toObject(),
  status: statusMap[admin._id.toString()] || "ACTIVE",
});

const resolveScopedStaffId = (requester, staffIdFromQuery = null) => {
  if (requester?.role === "ADMIN_STAFF") {
    return requester?._id;
  }

  if (["ADMIN", "SUPER_ADMIN"].includes(requester?.role)) {
    if (!staffIdFromQuery) return null;
    if (!mongoose.Types.ObjectId.isValid(staffIdFromQuery)) {
      throw new ApiError(400, "Invalid staffId");
    }
    return staffIdFromQuery;
  }

  throw new ApiError(403, "Access denied");
};

const buildMonthRange = (months) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setMonth(start.getMonth() - (months - 1));
  start.setHours(0, 0, 0, 0);

  const labels = [];
  const cursor = new Date(start);
  for (let i = 0; i < months; i += 1) {
    const label = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    labels.push(label);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return { startDate: start, labels };
};

export const getAllAdminStaff = async (query = {}) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, 20), 200);
  const search = String(query.search || "").trim();
  const roleFilters = normalizeRoleFilters(query.role);
  const requestedId = query.id ? String(query.id).trim() : "";

  if (requestedId) {
    if (!mongoose.Types.ObjectId.isValid(requestedId)) {
      throw new ApiError(400, "Invalid Staff ID");
    }
    const single = await getSingleAdminStaff(requestedId, null, { skipPermissionCheck: true });
    return {
      isSingle: true,
      data: single,
      meta: null,
    };
  }

  const adminRolesForQuery = roleFilters.length
    ? roleFilters.filter((role) => role !== "FRANCHISE_ADMIN")
    : ["SUPER_ADMIN", "ADMIN", "ADMIN_STAFF"];
  const includeFranchiseAdmins =
    roleFilters.length === 0 || roleFilters.includes("FRANCHISE_ADMIN");

  const [adminUsers, franchiseAdmins] = await Promise.all([
    adminRolesForQuery.length
      ? StaffRepo.findAllAdminStaff({ roles: adminRolesForQuery, search })
      : Promise.resolve([]),
    includeFranchiseAdmins
      ? StaffRepo.findAllFranchiseAdmins({ search })
      : Promise.resolve([]),
  ]);

  const statuses = await StaffStatus.find({
    staffId: { $in: adminUsers.map((s) => s._id) },
  });

  const statusMap = statuses.reduce((acc, curr) => {
    acc[curr.staffId.toString()] = curr.status;
    return acc;
  }, {});

  const mappedAdmins = adminUsers.map((staff) => mapAdminWithStatus(staff, statusMap));
  const mappedFranchiseAdmins = franchiseAdmins.map((staff) => ({
    ...staff.toObject(),
    status: staff.status || "ACTIVE",
  }));

  const merged = [...mappedAdmins, ...mappedFranchiseAdmins].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  const total = merged.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const skip = (page - 1) * limit;
  const paginatedData = merged.slice(skip, skip + limit);

  return {
    isSingle: false,
    data: paginatedData,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};

export const getSingleAdminStaff = async (staffId, requester, options = {}) => {
  const { skipPermissionCheck = false } = options;
  let staff = await StaffRepo.findAdminStaffById(staffId);
  let isFranchiseAdmin = false;

  if (!staff) {
    staff = await StaffRepo.findFranchiseAdminById(staffId);
    isFranchiseAdmin = Boolean(staff);
  }

  if (!staff) {
    throw new ApiError(404, "Admin staff not found");
  }

  if (!skipPermissionCheck) {
    // Check permission
    const isAllowed =
      requester?.role === "ADMIN" ||
      requester?.role === "SUPER_ADMIN" ||
      (requester?.role === "ADMIN_STAFF" &&
        staff._id.toString() === requester?._id?.toString()) ||
      (requester?.role === "FRANCHISE_ADMIN" &&
        staff._id.toString() === requester?._id?.toString());

    if (!isAllowed) {
      throw new ApiError(403, "You are not allowed to view this staff");
    }
  }

  if (isFranchiseAdmin) {
    return {
      ...staff.toObject(),
      status: staff.status || "ACTIVE",
    };
  }

  const statusDoc = await StaffStatus.findOne({ staffId: staff._id });

  return {
    ...staff.toObject(),
    status: statusDoc ? statusDoc.status : "ACTIVE",
  };
};



export const updateAdminStaff = async (staffId, payload) => {
  const staff = await StaffRepo.findById(staffId);
  if (!staff) throw new ApiError(404, "Admin staff not found");

  let currentStatus = "ACTIVE";

  // Handle Status Update
  if (payload.status) {
    const statusDoc = await StaffStatus.findOneAndUpdate(
      { staffId: staff._id },
      { status: payload.status },
      { upsert: true, new: true }
    );
    currentStatus = statusDoc.status;

    if (payload.status === "TERMINATED") {
      await LogoutRepo.clearSession(staff._id);
    }
  } else {
    const statusDoc = await StaffStatus.findOne({ staffId: staff._id });
    if (statusDoc) currentStatus = statusDoc.status;
  }

  const { status, ...updateData } = payload;
  const updatedStaff = await StaffRepo.updateById(staffId, updateData);

  return {
    ...updatedStaff.toObject(),
    status: currentStatus,
  };
};

export const deleteAdminStaff = async (staffId) => {
  const staff = await StaffRepo.findById(staffId);
  if (!staff) throw new ApiError(404, "Admin staff not found");

  return StaffRepo.deleteById(staffId);
};

export const getAssignedStaffStats = async (requester, query = {}) => {
  const requestedStaffId = query?.staffId ? String(query.staffId).trim() : null;
  const scopedStaffId =
    requester?.role === "ADMIN_STAFF" ? requester?._id : requestedStaffId;

  if (scopedStaffId && !mongoose.Types.ObjectId.isValid(scopedStaffId)) {
    throw new ApiError(400, "Invalid staffId");
  }

  const staffStats = await StaffRepo.getAssignedStaffStatusStats(scopedStaffId);
  const staffIds = staffStats.map((item) => item.staffId);

  const statuses = await StaffStatus.find({
    staffId: { $in: staffIds },
  }).select("staffId status");

  const statusMap = statuses.reduce((acc, curr) => {
    acc[curr.staffId.toString()] = curr.status;
    return acc;
  }, {});

  const data = staffStats.map((item) => ({
    staffId: item.staffId,
    staff: {
      ...item.staff,
      status: statusMap[item.staffId.toString()] || "ACTIVE",
    },
    tickets: {
      totalAssigned: item.totalAssigned,
      assigned: item.assigned,
      open: item.open,
      inProgress: item.inProgress,
      resolved: item.resolved,
      closed: item.closed,
    },
    lastAssignedAt: item.lastAssignedAt,
  }));

  const summary = data.reduce(
    (acc, curr) => {
      acc.assignedStaffCount += 1;
      acc.totalAssignedTickets += curr.tickets.totalAssigned;
      acc.statusCounts.assigned += curr.tickets.assigned;
      acc.statusCounts.open += curr.tickets.open;
      acc.statusCounts.inProgress += curr.tickets.inProgress;
      acc.statusCounts.resolved += curr.tickets.resolved;
      acc.statusCounts.closed += curr.tickets.closed;
      return acc;
    },
    {
      assignedStaffCount: 0,
      totalAssignedTickets: 0,
      statusCounts: {
        assigned: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        closed: 0,
      },
    }
  );

  return { summary, data };
};

export const getLatestAssignedRooms = async (limit = 5, requester) => {
  const normalizedLimit = Math.min(toPositiveInt(limit, 5), 50);
  const scopedStaffId =
    requester?.role === "ADMIN_STAFF" ? requester?._id : null;

  const rooms = await StaffRepo.getLatestAssignedRooms(normalizedLimit, scopedStaffId);
  return {
    limit: normalizedLimit,
    count: rooms.length,
    rooms,
  };
};

export const getAssignedCustomers = async (requester, query = {}) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, 20), 200);
  const search = String(query.search || "").trim();
  const plan = query.plan ?? query.userGroupId;
  const status = query.status ? String(query.status).trim().toUpperCase() : null;
  const staffIdFromQuery = query.staffId ? String(query.staffId).trim() : null;
  const scopedStaffId = resolveScopedStaffId(requester, staffIdFromQuery);

  const assignedCustomerIds = await StaffRepo.getAssignedCustomerIds(scopedStaffId);

  if (!assignedCustomerIds.length) {
    return {
      data: [],
      meta: {
        page,
        limit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  const filter = {
    _id: { $in: assignedCustomerIds },
  };

  if (status) {
    filter.status = status;
  }

  if (plan !== undefined && plan !== null && String(plan).trim() !== "") {
    const parsedPlan = Number.parseInt(String(plan), 10);
    filter.userGroupId = Number.isFinite(parsedPlan) ? parsedPlan : String(plan);
  }

  if (search) {
    const searchRegex = new RegExp(search, "i");
    filter.$or = [
      { firstName: { $regex: searchRegex } },
      { lastName: { $regex: searchRegex } },
      { userName: { $regex: searchRegex } },
    ];
  }

  const skip = (page - 1) * limit;
  const [customers, total, customerStats] = await Promise.all([
    Customer.find(filter)
      .select("-password -rawPayload")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit),
    Customer.countDocuments(filter),
    StaffRepo.getAssignedCustomerStats(scopedStaffId),
  ]);

  const statsMap = customerStats.reduce((acc, item) => {
    acc[String(item._id)] = item;
    return acc;
  }, {});

  const data = customers.map((customer) => {
    const stat = statsMap[String(customer._id)] || {};
    return {
      ...customer.toObject(),
      planInfo: {
        userGroupId: customer.userGroupId,
        userType: customer.userType || null,
      },
      assignedTicketCount: stat.assignedTicketCount || 0,
      lastAssignedAt: stat.lastAssignedAt || null,
    };
  });

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};

export const getAssignedCustomerPaymentHistory = async (requester, query = {}) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, 20), 100);
  const staffIdFromQuery = query.staffId ? String(query.staffId).trim() : null;
  const scopedStaffId = resolveScopedStaffId(requester, staffIdFromQuery);
  const status = query.status ? String(query.status).trim().toUpperCase() : null;
  const planName = query.planName ? String(query.planName).trim() : null;
  const fromDate = query.fromDate ? String(query.fromDate).trim() : null;
  const toDate = query.toDate ? String(query.toDate).trim() : null;

  const assignedCustomerIds = await StaffRepo.getAssignedCustomerIds(scopedStaffId);
  if (!assignedCustomerIds.length) {
    return {
      data: [],
      meta: {
        page,
        limit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  const customers = await Customer.find({ _id: { $in: assignedCustomerIds } })
    .select("userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId")
    .lean();

  const accountIds = customers
    .map((customer) => normalizeText(customer.accountId))
    .filter(Boolean);
  const groupIds = customers
    .map((customer) => normalizeText(customer.userGroupId))
    .filter(Boolean);
  const profileIds = customers
    .map((customer) => normalizeText(customer.activlineUserId))
    .filter(Boolean);

  const orFilters = [];
  if (accountIds.length) orFilters.push({ accountId: { $in: accountIds } });
  if (groupIds.length) orFilters.push({ groupId: { $in: groupIds } });
  if (profileIds.length) orFilters.push({ profileId: { $in: profileIds } });

  if (!orFilters.length) {
    return {
      data: [],
      meta: {
        page,
        limit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  const filter = { $or: orFilters };
  if (status && ["PENDING", "SUCCESS", "FAILED"].includes(status)) {
    filter.status = status;
  }
  if (planName) {
    filter.planName = { $regex: planName, $options: "i" };
  }

  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) {
      filter.createdAt.$gte = new Date(fromDate);
    }
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    PaymentHistory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PaymentHistory.countDocuments(filter),
  ]);

  const maps = {
    byAccountId: new Map(),
    byGroupId: new Map(),
    byProfileId: new Map(),
  };

  for (const customer of customers) {
    const accountKey = normalizeText(customer.accountId);
    const groupKey = normalizeText(customer.userGroupId);
    const profileKey = normalizeText(customer.activlineUserId);

    if (accountKey && !maps.byAccountId.has(accountKey)) {
      maps.byAccountId.set(accountKey, toCustomerSnapshot(customer));
    }
    if (groupKey && !maps.byGroupId.has(groupKey)) {
      maps.byGroupId.set(groupKey, toCustomerSnapshot(customer));
    }
    if (profileKey && !maps.byProfileId.has(profileKey)) {
      maps.byProfileId.set(profileKey, toCustomerSnapshot(customer));
    }
  }

  const data = items.map((item) => {
    const customer = resolveCustomerFromMaps(item, maps);
    return {
      paymentId: String(item._id),
      status: item.status,
      amount: item.planAmount,
      currency: item.currency,
      planName: item.planName,
      accountId: item.accountId || null,
      groupId: item.groupId || null,
      profileId: item.profileId || null,
      paidAt: item.paidAt || null,
      createdAt: item.createdAt || null,
      customer,
    };
  });

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};

export const getStaffGraphSummary = async (requester, query = {}) => {
  const staffId = resolveScopedStaffId(requester, query.staffId);
  const safeMonths = Math.min(Math.max(Number(query.months) || 6, 1), 24);
  const { startDate, labels } = buildMonthRange(safeMonths);

  const assignedCustomerIds = await StaffRepo.getAssignedCustomerIds(staffId);
  if (!assignedCustomerIds.length) {
    return {
      filters: { months: safeMonths },
      monthlyRevenue: labels.map((label) => ({
        month: label,
        totalAmount: 0,
        paymentCount: 0,
      })),
      monthlyCustomers: labels.map((label) => ({
        month: label,
        totalCustomers: 0,
      })),
      monthlyResolvedTickets: labels.map((label) => ({
        month: label,
        resolvedCount: 0,
      })),
    };
  }

  const customers = await Customer.find({ _id: { $in: assignedCustomerIds } })
    .select("accountId userGroupId activlineUserId createdAt")
    .lean();

  const accountIds = customers
    .map((customer) => normalizeText(customer.accountId))
    .filter(Boolean);
  const groupIds = customers
    .map((customer) => normalizeText(customer.userGroupId))
    .filter(Boolean);
  const profileIds = customers
    .map((customer) => normalizeText(customer.activlineUserId))
    .filter(Boolean);

  const orFilters = [];
  if (accountIds.length) orFilters.push({ accountId: { $in: accountIds } });
  if (groupIds.length) orFilters.push({ groupId: { $in: groupIds } });
  if (profileIds.length) orFilters.push({ profileId: { $in: profileIds } });

  const revenueMatch = { status: "SUCCESS", createdAt: { $gte: startDate } };
  if (orFilters.length) {
    revenueMatch.$or = orFilters;
  }

  const [revenueRows, customerRows, resolvedRows] = await Promise.all([
    PaymentHistory.aggregate([
      { $match: revenueMatch },
      {
        $addFields: {
          month: {
            $dateToString: { format: "%Y-%m", date: "$createdAt" },
          },
        },
      },
      {
        $group: {
          _id: "$month",
          totalAmount: { $sum: "$planAmount" },
          paymentCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Customer.aggregate([
      { $match: { _id: { $in: assignedCustomerIds }, createdAt: { $gte: startDate } } },
      {
        $addFields: {
          month: {
            $dateToString: { format: "%Y-%m", date: "$createdAt" },
          },
        },
      },
      {
        $group: {
          _id: "$month",
          totalCustomers: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    ChatRoom.aggregate([
      {
        $match: {
          status: "RESOLVED",
          assignedStaff: new mongoose.Types.ObjectId(String(staffId)),
          updatedAt: { $gte: startDate },
        },
      },
      {
        $addFields: {
          month: {
            $dateToString: { format: "%Y-%m", date: "$updatedAt" },
          },
        },
      },
      {
        $group: {
          _id: "$month",
          resolvedCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const revenueMap = new Map(revenueRows.map((row) => [row._id, row]));
  const customerMap = new Map(customerRows.map((row) => [row._id, row]));
  const resolvedMap = new Map(resolvedRows.map((row) => [row._id, row]));

  const monthlyRevenue = labels.map((label) => ({
    month: label,
    totalAmount: revenueMap.get(label)?.totalAmount || 0,
    paymentCount: revenueMap.get(label)?.paymentCount || 0,
  }));

  const monthlyCustomers = labels.map((label) => ({
    month: label,
    totalCustomers: customerMap.get(label)?.totalCustomers || 0,
  }));

  const monthlyResolvedTickets = labels.map((label) => ({
    month: label,
    resolvedCount: resolvedMap.get(label)?.resolvedCount || 0,
  }));

  return {
    filters: { months: safeMonths },
    monthlyRevenue,
    monthlyCustomers,
    monthlyResolvedTickets,
  };
};

export const getAssignedCustomerById = async (requester, customerId, query = {}) => {
  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new ApiError(400, "Invalid customerId");
  }

  const staffIdFromQuery = query.staffId ? String(query.staffId).trim() : null;
  const scopedStaffId = resolveScopedStaffId(requester, staffIdFromQuery);
  const assignedCustomerIds = await StaffRepo.getAssignedCustomerIds(scopedStaffId);

  if (!assignedCustomerIds.some((id) => String(id) === String(customerId))) {
    throw new ApiError(404, "Customer not found for this staff");
  }

  const customer = await Customer.findById(customerId).select("-password -rawPayload");
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  const paymentPage = toPositiveInt(query.paymentPage, 1);
  const paymentLimit = Math.min(toPositiveInt(query.paymentLimit, 10), 50);
  const ticketLimit = Math.min(toPositiveInt(query.ticketLimit, 10), 50);

  const paymentFilters = {
    $or: [
      customer.accountId ? { accountId: String(customer.accountId) } : null,
      customer.userGroupId ? { groupId: String(customer.userGroupId) } : null,
      customer.activlineUserId ? { profileId: String(customer.activlineUserId) } : null,
    ].filter(Boolean),
  };

  const paymentSkip = (paymentPage - 1) * paymentLimit;

  const [payments, paymentTotal, ticketRooms] = await Promise.all([
    paymentFilters.$or.length
      ? PaymentHistory.find(paymentFilters)
          .sort({ createdAt: -1 })
          .skip(paymentSkip)
          .limit(paymentLimit)
          .lean()
      : Promise.resolve([]),
    paymentFilters.$or.length
      ? PaymentHistory.countDocuments(paymentFilters)
      : Promise.resolve(0),
    ChatRoom.find({
      customer: new mongoose.Types.ObjectId(String(customerId)),
      assignedStaff: new mongoose.Types.ObjectId(String(scopedStaffId)),
    })
      .sort({ updatedAt: -1 })
      .limit(ticketLimit)
      .lean(),
  ]);

  const stats = await StaffRepo.getAssignedCustomerStats(scopedStaffId);
  const statMap = stats.reduce((acc, item) => {
    acc[String(item._id)] = item;
    return acc;
  }, {});
  const customerStat = statMap[String(customer._id)] || {};

  return {
    ...customer.toObject(),
    planInfo: {
      userGroupId: customer.userGroupId,
      userType: customer.userType || null,
    },
    assignedTicketCount: customerStat.assignedTicketCount || 0,
    lastAssignedAt: customerStat.lastAssignedAt || null,
    paymentHistory: {
      page: paymentPage,
      limit: paymentLimit,
      total: paymentTotal,
      totalPages: paymentTotal === 0 ? 0 : Math.ceil(paymentTotal / paymentLimit),
      data: payments.map((item) => ({
        paymentId: String(item._id),
        status: item.status,
        amount: item.planAmount,
        currency: item.currency,
        planName: item.planName,
        accountId: item.accountId || null,
        groupId: item.groupId || null,
        profileId: item.profileId || null,
        paidAt: item.paidAt || null,
        createdAt: item.createdAt || null,
      })),
    },
    ticketRooms: {
      count: ticketRooms.length,
      data: ticketRooms.map((room) => ({
        ticketId: room._id,
        status: room.status,
        lastMessage: room.lastMessage || null,
        lastMessageAt: room.lastMessageAt || null,
        createdAt: room.createdAt || null,
        updatedAt: room.updatedAt || null,
      })),
    },
  };
};

export const updateAssignedCustomer = async (requester, customerId, payload = {}, query = {}) => {
  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new ApiError(400, "Invalid customerId");
  }

  const staffIdFromQuery = query.staffId ? String(query.staffId).trim() : null;
  const scopedStaffId = resolveScopedStaffId(requester, staffIdFromQuery);
  const assignedCustomerIds = await StaffRepo.getAssignedCustomerIds(scopedStaffId);
  if (!assignedCustomerIds.some((id) => String(id) === String(customerId))) {
    throw new ApiError(404, "Customer not found for this staff");
  }

  const allowedFields = [
    "firstName",
    "lastName",
    "userName",
    "phoneNumber",
    "altPhoneNumber",
    "emailId",
    "altEmailId",
    "status",
    "userGroupId",
    "userType",
    "address",
    "installationAddress",
  ];

  const updateData = {};
  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      updateData[field] = payload[field];
    }
  });

  if (updateData.status) {
    updateData.status = String(updateData.status).trim().toUpperCase();
  }

  if (Object.keys(updateData).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  const updated = await Customer.findByIdAndUpdate(customerId, updateData, {
    new: true,
    runValidators: true,
  }).select("-password -rawPayload");

  return updated;
};

export const deleteAssignedCustomer = async (requester, customerId, query = {}) => {
  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new ApiError(400, "Invalid customerId");
  }

  const staffIdFromQuery = query.staffId ? String(query.staffId).trim() : null;
  const scopedStaffId = resolveScopedStaffId(requester, staffIdFromQuery);
  const assignedCustomerIds = await StaffRepo.getAssignedCustomerIds(scopedStaffId);
  if (!assignedCustomerIds.some((id) => String(id) === String(customerId))) {
    throw new ApiError(404, "Customer not found for this staff");
  }

  const deleted = await Customer.findByIdAndDelete(customerId).select("-password -rawPayload");
  if (!deleted) {
    throw new ApiError(404, "Customer not found");
  }

  return deleted;
};
