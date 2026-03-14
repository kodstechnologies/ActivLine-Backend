import ChatRoom from "../../../models/chat/chatRoom.model.js";
import PaymentHistory from "../../../models/payment/paymentHistory.model.js";
import Customer from "../../../models/Customer/customer.model.js";

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

export const getMonthlyRevenueByGroup = ({ groupId, accountId, startDate }) => {
  const match = { status: "SUCCESS" };

  if (groupId) {
    match.groupId = String(groupId);
    if (accountId) {
      match.accountId = String(accountId);
    }
  } else if (accountId) {
    match.accountId = String(accountId);
  }

  if (startDate) {
    match.createdAt = { $gte: startDate };
  }

  return PaymentHistory.aggregate([
    { $match: match },
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
  ]);
};

export const countCustomersCreated = ({ accountId, startDate, endDate }) => {
  const query = {};

  if (accountId) {
    query.accountId = String(accountId);
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }

  return Customer.countDocuments(query);
};

export const getCustomersCreatedByMonth = ({ accountId, startDate }) => {
  const match = {};

  if (accountId) {
    match.accountId = String(accountId);
  }

  if (startDate) {
    match.createdAt = { $gte: startDate };
  }

  return Customer.aggregate([
    { $match: match },
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
  ]);
};

export const getResolvedTicketsByStaff = ({ accountId, startDate, endDate }) => {
  const match = { status: "RESOLVED" };

  if (startDate || endDate) {
    match.updatedAt = {};
    if (startDate) match.updatedAt.$gte = startDate;
    if (endDate) match.updatedAt.$lte = endDate;
  }

  const pipeline = [{ $match: match }];

  if (accountId) {
    const customersCollection = Customer.collection.name;
    pipeline.push(
      {
        $lookup: {
          from: customersCollection,
          localField: "customer",
          foreignField: "_id",
          as: "customerDoc",
        },
      },
      { $unwind: "$customerDoc" },
      { $match: { "customerDoc.accountId": String(accountId) } }
    );
  }

  pipeline.push(
    {
      $group: {
        _id: "$assignedStaff",
        resolvedCount: { $sum: 1 },
      },
    },
    { $sort: { resolvedCount: -1 } }
  );

  return ChatRoom.aggregate(pipeline);
};

export const countResolvedTickets = async ({ accountId, startDate, endDate }) => {
  const match = { status: "RESOLVED" };

  if (startDate || endDate) {
    match.updatedAt = {};
    if (startDate) match.updatedAt.$gte = startDate;
    if (endDate) match.updatedAt.$lte = endDate;
  }

  if (!accountId) {
    return ChatRoom.countDocuments(match);
  }

  const customersCollection = Customer.collection.name;
  const rows = await ChatRoom.aggregate([
    { $match: match },
    {
      $lookup: {
        from: customersCollection,
        localField: "customer",
        foreignField: "_id",
        as: "customerDoc",
      },
    },
    { $unwind: "$customerDoc" },
    { $match: { "customerDoc.accountId": String(accountId) } },
    { $count: "count" },
  ]);

  return rows[0]?.count || 0;
};
