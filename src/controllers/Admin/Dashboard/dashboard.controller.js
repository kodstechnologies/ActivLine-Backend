import { asyncHandler } from "../../../utils/AsyncHandler.js";
import ApiResponse from "../../../utils/ApiReponse.js";
import * as DashboardService from "../../../services/admin/Dashboard/dashboard.service.js";
import * as StaffService from "../../../services/staff/adminStaff.manage.service.js";

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

  const mapped = payments.map((item) => ({
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
    planName: item.planName,
    paidAt: item.paidAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    plan: {
      profileId: item.profileId,
      planName: item.planName,
      planAmount: item.planAmount,
      details: item.planDetails || {},
    },
  }));

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
