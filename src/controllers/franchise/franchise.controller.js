import { getFranchiseAccounts,syncFranchiseData  } from "../../services/franchise/franchise.service.js";
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