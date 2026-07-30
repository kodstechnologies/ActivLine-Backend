import {
  getFranchiseAccounts,
  syncFranchiseData,
} from "../../services/franchise/franchise.service.js";
import Franchise from "../../models/Franchise/franchise.model.js";

export const fetchFranchiseAccounts = async (req, res) => {
  try {
    const { accountId } = req.params;

    if (accountId) {
      const franchise = await Franchise.findOne({ accountId });

      if (!franchise) {
        return res.status(404).json({
          success: false,
          message: "Franchise not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Franchise details fetched successfully",
        data: franchise,
      });
    }

    const data = await syncFranchiseData();

    const { search } = req.query;
    if (search) {
      const searchRegex = new RegExp(search, "i");
      const filteredData = await Franchise.find({
        $or: [
          { companyName: searchRegex },
          { accountName: searchRegex },
          { accountId: searchRegex },
        ],
      }).sort({ dateCreated: -1 });

      return res.status(200).json({
        success: true,
        message: "Franchise list fetched successfully",
        data: filteredData,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Franchise list fetched successfully",
      data: data,
    });
  } catch (error) {
    console.error("Franchise API error:", error.message);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getFranchiseAvailability = async (req, res) => {
  try {
    const { accountId } = req.params;

    const franchise = await Franchise.findOne({ accountId });

    if (!franchise) {
      return res.status(404).json({
        success: false,
        message: "Franchise not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Franchise availability fetched successfully",
      data: franchise.franchise_availavility || {
        startTime: "09:00 AM",
        endTime: "09:00 PM",
      },
    });
  } catch (error) {
    console.error("Get availability error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateFranchiseAvailability = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { startTime, endTime } = req.body;

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "startTime and endTime are required",
      });
    }

    if (
      req.user.role === "FRANCHISE_ADMIN" &&
      req.user.accountId !== accountId
    ) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Access denied",
      });
    }

    const franchise = await Franchise.findOneAndUpdate(
      { accountId },
      {
        $set: {
          "franchise_availavility.startTime": startTime,
          "franchise_availavility.endTime": endTime,
        },
      },
      { new: true },
    );

    if (!franchise) {
      return res.status(404).json({
        success: false,
        message: "Franchise not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Franchise availability updated successfully",
      data: franchise.franchise_availavility,
    });
  } catch (error) {
    console.error("Update availability error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
