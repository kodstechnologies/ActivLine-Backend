import * as Repo from "../../../repositories/admin/Dashboard/dashboard.repository.js";

import { getGroupDetails } from "../../franchise/groupDetails.service.js";

export const getOpenTickets = async () => ({
  openTickets: await Repo.countOpenTickets(),
});

export const getInProgressTickets = async () => ({
  inProgressTickets: await Repo.countInProgressTickets(),
});

export const getTodayResolvedTickets = async () => ({
  todayResolvedTickets: await Repo.countTodayResolvedTickets(),
});

export const getTotalCustomers = async () => ({
  totalCustomers: await Repo.countDistinctCustomers(),
});

export const getRecentTickets = async (limit) =>
  Repo.getRecentTickets(limit);

export const getRecentPayments = async (limit) =>
  Repo.getRecentPayments(limit);



export const getAssignedRoomsCount = async () => {
  const assignedRooms = await Repo.countRoomsAssignedToStaff();

  return { assignedRooms };
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

const normalizeKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const extractRowsFromGroupDetails = (payload) => {
  if (!payload) return [];

  const candidateRoots = [
    payload?.data?.data,
    payload?.data,
    payload?.message?.data,
    payload?.message,
    payload,
  ];

  for (const candidate of candidateRoots) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") {
      for (const value of Object.values(candidate)) {
        if (Array.isArray(value)) return value;
      }
    }
  }

  return [];
};

const pickValueByKeys = (obj, keys) => {
  if (!obj || typeof obj !== "object") return null;

  const normalizedTargets = keys.map(normalizeKey);
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) continue;
    if (!normalizedTargets.includes(normalizeKey(key))) continue;
    const asString = String(val).trim();
    if (asString) return asString;
  }

  return null;
};

const resolveRevenueIdsForAccount = async (accountId) => {
  if (!accountId) return { groupIds: [], profileIds: [] };

  try {
    const payload = await getGroupDetails(accountId);
    const rows = extractRowsFromGroupDetails(payload);

    const groupIds = new Set();
    const profileIds = new Set();

    for (const row of rows) {
      const groupId = pickValueByKeys(row, ["groupId", "group_id", "Group_id"]);
      const profileId = pickValueByKeys(row, [
        "profileId",
        "profile_id",
        "Profile_id",
      ]);

      if (groupId) groupIds.add(groupId);
      if (profileId) profileIds.add(profileId);
    }

    return { groupIds: Array.from(groupIds), profileIds: Array.from(profileIds) };
  } catch {
    return { groupIds: [], profileIds: [] };
  }
};

export const getReportSummary = async ({ groupId, accountId, months = 6 }) => {
  const safeMonths = Math.min(Math.max(Number(months) || 6, 1), 24);
  const { startDate, labels } = buildMonthRange(safeMonths);
  const startOfThisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const now = new Date();

  const revenueIds =
    !groupId && accountId ? await resolveRevenueIdsForAccount(accountId) : null;

  const [
    revenueRows,
    customerRows,
    resolvedByStaff,
    resolvedThisMonth,
    customersThisMonth,
    totalCollectedRows,
    openTicketCustomersCount,
    resolvedTicketsThisMonthList,
    latestTickets,
  ] =
    await Promise.all([
      Repo.getMonthlyRevenueByGroup({
        groupId,
        accountId,
        startDate,
        groupIds: revenueIds?.groupIds,
        profileIds: revenueIds?.profileIds,
      }),
      Repo.getCustomersCreatedByMonth({ accountId, startDate }),
      Repo.getResolvedTicketsByStaff({ accountId, startDate }),
      Repo.countResolvedTickets({ accountId, startDate: startOfThisMonth, endDate: now }),
      Repo.countCustomersCreated({
        accountId,
        startDate: startOfThisMonth,
        endDate: now,
      }),
      Repo.getTotalCollectedRevenue({
        groupId,
        accountId,
        startDate,
        groupIds: revenueIds?.groupIds,
        profileIds: revenueIds?.profileIds,
      }),
      Repo.countOpenTicketCustomers({ accountId }),
      Repo.getResolvedTicketsList({
        accountId,
        startDate: startOfThisMonth,
        endDate: now,
        limit: 25,
      }),
      Repo.getLatestTicketsList({
        accountId,
        limit: 5,
      }),
    ]);

  const revenueMap = new Map(revenueRows.map((row) => [row._id, row]));
  const customerMap = new Map(customerRows.map((row) => [row._id, row]));

  const monthlyRevenue = labels.map((label) => ({
    month: label,
    totalAmount: revenueMap.get(label)?.totalAmount || 0,
    paymentCount: revenueMap.get(label)?.paymentCount || 0,
  }));

  const monthlyCustomers = labels.map((label) => ({
    month: label,
    totalCustomers: customerMap.get(label)?.totalCustomers || 0,
  }));

  const totalCollectedAmount = totalCollectedRows?.[0]?.totalAmount || 0;

  return {
    filters: {
      groupId: groupId || null,
      accountId: accountId || null,
      months: safeMonths,
    },
    monthlyRevenue,
    monthlyCustomers,
    totalCollectedAmount,
    openTicketCustomers: openTicketCustomersCount,
    customersCreatedThisMonth: customersThisMonth,
    resolvedTicketsThisMonth: resolvedThisMonth,
    resolvedTicketsThisMonthList,
    resolvedTicketsByStaff: resolvedByStaff,
    latestTickets,
  };
};

export const getGlobalGraphSummary = async ({ months = 6 } = {}) => {
  const safeMonths = Math.min(Math.max(Number(months) || 6, 1), 24);
  const { startDate, labels } = buildMonthRange(safeMonths);

  const [
    revenueRows,
    customerRows,
    resolvedRows,
    resolvedByStaff,
    resolvedByFranchiseAdmin,
    revenueByFranchise,
  ] = await Promise.all([
    Repo.getMonthlyRevenueAll({ startDate }),
    Repo.getCustomersCreatedByMonthAll({ startDate }),
    Repo.getResolvedTicketsByMonthAll({
      startDate,
      endDate: new Date(),
    }),
    Repo.getTopResolversByStaffAll({ startDate, endDate: new Date(), limit: 10 }),
    Repo.getTopResolversByFranchiseAdminAll({ startDate, endDate: new Date(), limit: 10 }),
    Repo.getTopRevenueByFranchiseAll({ startDate, limit: 10 }),
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

  const topResolvers = [...resolvedByStaff, ...resolvedByFranchiseAdmin].sort(
    (a, b) => Number(b.resolvedCount || 0) - Number(a.resolvedCount || 0)
  );

  return {
    filters: {
      months: safeMonths,
    },
    monthlyRevenue,
    monthlyCustomers,
    monthlyResolvedTickets,
    topResolvers,
    topRevenueFranchises: revenueByFranchise,
  };
};
