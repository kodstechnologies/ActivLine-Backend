import ChatRoom from "../../models/chat/chatRoom.model.js";
import Customer from "../../models/customer.model.js";

export const countByStatus = (status) =>
  ChatRoom.countDocuments({ status, isConnectedToAgent: true });

export const countResolvedToday = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return ChatRoom.countDocuments({
    status: "RESOLVED",
    updatedAt: { $gte: start, $lte: end },
  });
};

export const countCustomers = () =>
  Customer.countDocuments();

export const getRecentRooms = (limit = 5) =>
  ChatRoom.find({ isConnectedToAgent: true })
    .populate("customer", "fullName")
    .sort({ createdAt: -1 })
    .limit(limit);
