import crypto from "crypto";
import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import ApiError from "../../utils/ApiError.js";
import ChatRoom from "../../models/chat/chatRoom.model.js";
import ChatMessage from "../../models/chat/chatMessage.model.js";
import Customer from "../../models/Customer/customer.model.js";
import FranchiseAdmin from "../../models/Franchise/franchiseAdmin.model.js";
import * as ChatService from "../../services/chat/chat.service.js";

const ALLOWED_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const ALLOWED_SORT_FIELDS = ["updatedAt", "createdAt", "lastMessageAt", "status"];

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
};

const resolveScopedAccountId = (req, source = {}) => {
  if (req.user?.role === "FRANCHISE_ADMIN") {
    return req.user.accountId || null;
  }
  if (req.user?.role === "ADMIN" || req.user?.role === "SUPER_ADMIN") {
    return source.accountId || null;
  }
  return null;
};

export const createFranchiseChatRoom = asyncHandler(async (req, res) => {
  const { customerId, message } = req.body || {};
  const accountId = resolveScopedAccountId(req, req.body || {});

  if (!accountId) {
    throw new ApiError(400, "accountId is required");
  }

  if (!customerId) {
    throw new ApiError(400, "customerId is required");
  }

  const customer = await Customer.findOne({ _id: customerId, accountId }).select("_id");
  if (!customer) {
    throw new ApiError(404, "Customer not found in your franchise");
  }

  const roomId = crypto.randomInt(1000000000, 10000000000).toString();
  const room = await ChatRoom.create({
    _id: roomId,
    customer: customer._id,
    createdByAdmin: req.user._id,
    assignedFranchiseAdmin: req.user._id,
    status: "OPEN",
  });

  if (message && String(message).trim()) {
    const text = String(message).trim();

    await ChatMessage.create({
      roomId: room._id,
      senderId: req.user._id,
      senderModel: "Admin",
      senderRole: "FRANCHISE_ADMIN",
      message: text,
      messageType: "TEXT",
      statusAtThatTime: room.status,
    });

    await ChatRoom.findByIdAndUpdate(room._id, {
      lastMessage: text,
      lastMessageAt: new Date(),
    });
  }

  const savedRoom = await ChatRoom.findById(room._id)
    .populate("customer", "firstName lastName userName phoneNumber emailId accountId")
    .populate("assignedStaff", "name email")
    .populate("assignedFranchiseAdmin", "name email accountId role status");

  return res.json(ApiResponse.success(savedRoom, "Franchise chat room created successfully"));
});

export const getFranchiseChatRooms = asyncHandler(async (req, res) => {
  const accountId = resolveScopedAccountId(req, req.query || {});
  if (!accountId) {
    throw new ApiError(400, "accountId is required");
  }

  const page = toPositiveInt(req.query.page, 1);
  const limit = Math.min(toPositiveInt(req.query.limit, 10), 100);
  const skip = (page - 1) * limit;
  const status = req.query.status ? String(req.query.status).toUpperCase() : null;
  const search = req.query.search ? String(req.query.search).trim() : "";
  const assigned = req.query.assigned;
  const sortBy = ALLOWED_SORT_FIELDS.includes(req.query.sortBy) ? req.query.sortBy : "updatedAt";
  const sortOrder = String(req.query.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;
  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : null;
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : null;

  const match = {};
  if (status && ALLOWED_STATUSES.includes(status)) {
    match.status = status;
  }

  if (assigned === "true") {
    match.assignedStaff = { $ne: null };
  }
  if (assigned === "false") {
    match.assignedStaff = null;
  }

  if (dateFrom || dateTo) {
    match.updatedAt = {};
    if (dateFrom && !Number.isNaN(dateFrom.getTime())) {
      match.updatedAt.$gte = dateFrom;
    }
    if (dateTo && !Number.isNaN(dateTo.getTime())) {
      match.updatedAt.$lte = dateTo;
    }
    if (Object.keys(match.updatedAt).length === 0) {
      delete match.updatedAt;
    }
  }

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: "customers",
        localField: "customer",
        foreignField: "_id",
        as: "customer",
      },
    },
    { $unwind: "$customer" },
    { $match: { "customer.accountId": accountId } },
  ];

  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { _id: { $regex: search, $options: "i" } },
          { "customer.userName": { $regex: search, $options: "i" } },
          { "customer.firstName": { $regex: search, $options: "i" } },
          { "customer.lastName": { $regex: search, $options: "i" } },
          { "customer.phoneNumber": { $regex: search, $options: "i" } },
          { "customer.emailId": { $regex: search, $options: "i" } },
          { lastMessage: { $regex: search, $options: "i" } },
        ],
      },
    });
  }

  pipeline.push(
    {
      $lookup: {
        from: "admins",
        localField: "assignedStaff",
        foreignField: "_id",
        as: "assignedStaff",
      },
    },
    {
      $lookup: {
        from: "franchiseadmins",
        localField: "assignedFranchiseAdmin",
        foreignField: "_id",
        as: "assignedFranchiseAdmin",
      },
    },
    {
      $unwind: {
        path: "$assignedStaff",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $unwind: {
        path: "$assignedFranchiseAdmin",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 1,
        status: 1,
        lastMessage: 1,
        lastMessageAt: 1,
        createdAt: 1,
        updatedAt: 1,
        customer: {
          _id: "$customer._id",
          firstName: "$customer.firstName",
          lastName: "$customer.lastName",
          userName: "$customer.userName",
          phoneNumber: "$customer.phoneNumber",
          emailId: "$customer.emailId",
          accountId: "$customer.accountId",
        },
        assignedStaff: {
          _id: "$assignedStaff._id",
          name: "$assignedStaff.name",
          email: "$assignedStaff.email",
        },
        assignedFranchiseAdmin: {
          _id: "$assignedFranchiseAdmin._id",
          name: "$assignedFranchiseAdmin.name",
          email: "$assignedFranchiseAdmin.email",
          accountId: "$assignedFranchiseAdmin.accountId",
          role: "$assignedFranchiseAdmin.role",
          status: "$assignedFranchiseAdmin.status",
        },
      },
    },
    { $sort: { [sortBy]: sortOrder } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    }
  );

  const [result] = await ChatRoom.aggregate(pipeline);
  const rooms = result?.data || [];
  const total = result?.total?.[0]?.count || 0;

  return res.json(
    ApiResponse.success(rooms, "Franchise chat rooms fetched successfully", {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    })
  );
});

export const getFranchiseRoomMessages = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const accountId = resolveScopedAccountId(req, req.query || {});

  const room = await ChatRoom.findById(roomId).populate("customer", "accountId");
  if (!room) {
    throw new ApiError(404, "Chat room not found");
  }

  if (accountId && (!room.customer || room.customer.accountId !== accountId)) {
    throw new ApiError(403, "Access denied");
  }

  const page = toPositiveInt(req.query.page, 1);
  const limit = Math.min(toPositiveInt(req.query.limit, 20), 200);
  const skip = (page - 1) * limit;
  const senderRole = req.query.senderRole ? String(req.query.senderRole).toUpperCase() : null;
  const search = req.query.search ? String(req.query.search).trim() : "";
  const sortOrder = String(req.query.sortOrder || "asc").toLowerCase() === "desc" ? -1 : 1;

  const filter = { roomId };
  if (senderRole) {
    filter.senderRole = senderRole;
  }
  if (search) {
    filter.message = { $regex: search, $options: "i" };
  }

  const [messages, total] = await Promise.all([
    ChatMessage.find(filter)
      .sort({ createdAt: sortOrder })
      .skip(skip)
      .limit(limit)
      .populate("senderId", "fullName name email mobile role"),
    ChatMessage.countDocuments(filter),
  ]);

  return res.json(
    ApiResponse.success(messages, "Franchise chat messages fetched successfully", {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    })
  );
});

export const updateFranchiseRoomStatus = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { status } = req.body || {};
  const accountId = resolveScopedAccountId(req, req.body || {});

  const normalizedStatus = String(status || "").trim().toUpperCase();
  if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
    throw new ApiError(400, "Invalid status");
  }

  const room = await ChatRoom.findById(roomId).populate("customer", "accountId");
  if (!room) {
    throw new ApiError(404, "Chat room not found");
  }

  if (accountId && (!room.customer || room.customer.accountId !== accountId)) {
    throw new ApiError(403, "Access denied");
  }

  const updatedRoom = await ChatService.updateTicketStatus(req, roomId, normalizedStatus);

  return res.json(
    ApiResponse.success(
      updatedRoom,
      updatedRoom.deleted
        ? "Ticket closed and full chat history deleted"
        : `Ticket status updated to ${normalizedStatus}`
    )
  );
});

export const assignFranchiseAdminToRoom = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { franchiseAdminId } = req.body || {};

  if (!franchiseAdminId) {
    throw new ApiError(400, "franchiseAdminId is required");
  }

  const room = await ChatRoom.findById(roomId).populate("customer", "accountId");
  if (!room) {
    throw new ApiError(404, "Chat room not found");
  }

  const roomAccountId = room.customer?.accountId;
  if (!roomAccountId) {
    throw new ApiError(400, "Room customer account not found");
  }

  if (req.user.role === "FRANCHISE_ADMIN") {
    if (!req.user.accountId || req.user.accountId !== roomAccountId) {
      throw new ApiError(403, "Access denied");
    }
  }

  const targetAdmin = await FranchiseAdmin.findOne({
    _id: franchiseAdminId,
    accountId: roomAccountId,
    status: "ACTIVE",
  }).select("_id name email accountId role status");

  if (!targetAdmin) {
    throw new ApiError(404, "Target admin not found in this franchise");
  }

  const updatedRoom = await ChatRoom.findByIdAndUpdate(
    roomId,
    {
      assignedFranchiseAdmin: targetAdmin._id,
      status: "ASSIGNED",
    },
    { new: true }
  )
    .populate("customer", "firstName lastName userName phoneNumber emailId accountId")
    .populate("assignedStaff", "name email")
    .populate("assignedFranchiseAdmin", "name email accountId role status");

  return res.json(
    ApiResponse.success(
      updatedRoom,
      "Chat room assigned to franchise admin successfully"
    )
  );
});
