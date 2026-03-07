import { fetchProfileDetails } from "../../services/franchise/profileDetails.service.js";

export const getProfileDetails = async (req, res) => {

  try {

    const { accountId, profileId } = req.params;

    const data = await fetchProfileDetails(accountId, profileId);

    res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {

    console.error("Profile details error:", error.message);

    res.status(500).json({
      success: false,
      message: error.message
    });

  }

};