import * as AdminService from "../../services/admin/admin.service.js";
import ApiResponse from "../../utils/ApiReponse.js";
import { asyncHandler } from "../../utils/AsyncHandler.js";
import Customer from "../../models/Customer/customer.model.js";
import Referral from "../../models/Customer/referral.model.js";

export const getAllStaff = async (req, res) => {
  const staff = await AdminService.getAllStaff();
  res.json(ApiResponse.success(staff, "Staff fetched successfully"));
};

export const getAdminStaff = asyncHandler(async (_req, res) => {
  const staff = await AdminService.getAdminStaffList();
  res.json(
    ApiResponse.success(staff, "Admin staff fetched")
  );
});

export const getGlobalReferrals = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status } = req.query;

  const filter = {};

  if (status === "completed") filter.referralCompleted = true;
  if (status === "pending") filter.referralCompleted = false;

  // Search by referee's details
  if (search) {
    const searchRegex = new RegExp(search, "i");
    const matchingReferees = await Customer.find({
      $or: [
        { userName: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex }
      ]
    }).select("_id").lean();
    filter.referee = { $in: matchingReferees.map(c => c._id) };
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [referralRecords, totalCount] = await Promise.all([
    Referral.find(filter)
      .populate("referrer", "userName firstName lastName")
      .populate("referee", "userName firstName lastName createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Referral.countDocuments(filter)
  ]);

  res.json(
    ApiResponse.success(
      {
        referrals: referralRecords.map(r => {
          if (!r.referee) return null;
          return {
            referee: {
              _id: r.referee._id,
              userName: r.referee.userName,
              name: `${r.referee.firstName || ''} ${r.referee.lastName || ''}`.trim() || r.referee.userName,
              dateJoined: r.referredAt
            },
            referrer: r.referrer ? {
              _id: r.referrer._id,
              userName: r.referrer.userName,
              name: `${r.referrer.firstName || ''} ${r.referrer.lastName || ''}`.trim() || r.referrer.userName,
              codeUsed: r.codeUsed
            } : null,
            status: r.referralCompleted ? "Completed (Reward Granted)" : "Pending Purchase"
          };
        }).filter(Boolean),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum)
        }
      },
      "Global referrals fetched successfully"
    )
  );
});