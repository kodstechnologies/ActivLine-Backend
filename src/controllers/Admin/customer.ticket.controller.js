import mongoose from "mongoose";
import ChatRoom from "../../models/chat/chatRoom.model.js";
import Customer from "../../models/Customer/customer.model.js";
import ApiResponse from "../../utils/ApiReponse.js";
import ApiError from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/AsyncHandler.js";

export const getCustomerTickets = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const status = req.query.status ? String(req.query.status).toUpperCase() : null;

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new ApiError(400, "Invalid customerId");
  }

  const customer = await Customer.findById(customerId).select("_id");
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  const filter = { customer: customer._id };
  if (status) {
    filter.status = status;
  }

  const rooms = await ChatRoom.find(filter)
    .select(
      "_id status createdAt updatedAt lastMessage lastMessageAt assignedStaff assignedFranchiseAdmin"
    )
    .populate("assignedStaff", "name email")
    .populate("assignedFranchiseAdmin", "name email accountId role status")
    .sort({ updatedAt: -1 });

  return res.json(
    ApiResponse.success(rooms, "Customer tickets fetched successfully")
  );
});
