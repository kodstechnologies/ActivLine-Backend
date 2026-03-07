import { fetchProfilesByFranchise } from "../../services/franchise/profile.service.js";

export const getProfiles = async (req, res) => {

  try {

    const { accountId } = req.params;

    const profiles = await fetchProfilesByFranchise(accountId);

    res.status(200).json({
      success: true,
      data: profiles
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message
    });

  }

};