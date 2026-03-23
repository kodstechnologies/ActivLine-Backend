import {
  fetchProfilesByFranchise,
  fetchProfilesWithDetailsByFranchise,
} from "../../services/franchise/profile.service.js";

export const getProfiles = async (req, res) => {

  try {

    const { accountId } = req.params;
    const { page, limit, search, type, profileId: profileIdFromQuery, id } = req.query || {};
    const profileIdFromParams = req.params?.profileId;
    const profileId = profileIdFromParams || profileIdFromQuery || id;

    const includeDetails = ["1", "true", "yes"].includes(
      String(req.query.includeDetails || "").toLowerCase()
    );

    const result = await (includeDetails
      ? fetchProfilesWithDetailsByFranchise
      : fetchProfilesByFranchise)(accountId, {
      page,
      limit,
      search,
      type,
      profileId,
      typeFromDetails: includeDetails && Boolean(type),
    });

    if (result.isSingle) {
      if (!result.item) {
        return res.status(404).json({
          success: false,
          message: "Profile not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: result.item,
      });
    }

    res.status(200).json({
      success: true,
      data: result.items,
      meta: result.meta,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message
    });

  }

};
