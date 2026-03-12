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
