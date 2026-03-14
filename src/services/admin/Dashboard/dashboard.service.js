import * as Repo from "../../../repositories/admin/Dashboard/dashboard.repository.js";

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

export const getReportSummary = async ({ groupId, accountId, months = 6 }) => {
  const safeMonths = Math.min(Math.max(Number(months) || 6, 1), 24);
  const { startDate, labels } = buildMonthRange(safeMonths);

  const [revenueRows, customerRows, resolvedByStaff, resolvedThisMonth, customersThisMonth] =
    await Promise.all([
      Repo.getMonthlyRevenueByGroup({ groupId, accountId, startDate }),
      Repo.getCustomersCreatedByMonth({ accountId, startDate }),
      Repo.getResolvedTicketsByStaff({ accountId, startDate }),
      Repo.countResolvedTickets({ accountId, startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1), endDate: new Date() }),
      Repo.countCustomersCreated({
        accountId,
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        endDate: new Date(),
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

  return {
    filters: {
      groupId: groupId || null,
      accountId: accountId || null,
      months: safeMonths,
    },
    monthlyRevenue,
    monthlyCustomers,
    customersCreatedThisMonth: customersThisMonth,
    resolvedTicketsThisMonth: resolvedThisMonth,
    resolvedTicketsByStaff: resolvedByStaff,
  };
};
