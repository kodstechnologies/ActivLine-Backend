import ChatRoom from "../../../models/chat/chatRoom.model.js";
import PaymentHistory from "../../../models/payment/paymentHistory.model.js";

/* OPEN TICKETS */
export const countOpenTickets = () =>
  ChatRoom.countDocuments({ status: "OPEN" });

/* IN PROGRESS */
export const countInProgressTickets = () =>
  ChatRoom.countDocuments({
    status: { $in: ["ASSIGNED", "IN_PROGRESS"] },
  });

/* TODAY RESOLVED */
export const countTodayResolvedTickets = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return ChatRoom.countDocuments({
    status: "RESOLVED",
    updatedAt: { $gte: start, $lte: end },
  });
};

/* DISTINCT CHAT CUSTOMERS */
export const countDistinctCustomers = async () => {
  const ids = await ChatRoom.distinct("customer", {
    customer: { $ne: null },
  });
  return ids.length;
};

/* RECENT TICKETS */
export const getRecentTickets = (limit = 5) =>
  ChatRoom.find()
    .populate("customer", "fullName email")
    .sort({ updatedAt: -1 })
    .limit(limit);

/* RECENT PAYMENTS */
export const getRecentPayments = (limit = 5) =>
  PaymentHistory.find(
    {},
    {
      groupId: 1,
      accountId: 1,
      profileId: 1,
      planName: 1,
      planAmount: 1,
      currency: 1,
      status: 1,
      razorpayOrderId: 1,
      razorpayPaymentId: 1,
      paidAt: 1,
      planDetails: 1,
      createdAt: 1,
      updatedAt: 1,
    }
  )
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();


   export const countRoomsAssignedToStaff = () =>
  ChatRoom.countDocuments({
    customer: { $ne: null },       // created by customer
    assignedStaff: { $ne: null },  // assigned by admin
  });
