import { getFranchiseAccounts,syncFranchiseData  } from "../../services/franchise/franchise.service.js";





export const fetchFranchiseAccounts = async (req, res) => {

  try {

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