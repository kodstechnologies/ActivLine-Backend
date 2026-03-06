import {
  getAllProfileIds,
  getProfileDetails,
} from "../../external/activline/activline.profile.api.js";

export const getAllProfilesWithDetails = async (req, res) => {
  try {
    // pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;

    // 1️⃣ get all profiles
    const profiles = await getAllProfileIds();

    const profileList = profiles.map((p) => p.Profile);

    const totalProfiles = profileList.length;

    // pagination calculation
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const paginatedProfiles = profileList.slice(startIndex, endIndex);

    // 2️⃣ call details only for paginated profiles
    const detailPromises = paginatedProfiles.map((profile) =>
      getProfileDetails(profile.id)
    );

    const details = await Promise.all(detailPromises);

    // 3️⃣ merge data
    const result = paginatedProfiles.map((profile, index) => ({
      id: profile.id,
      name: profile.name,
      deactivated: profile.deactivated,
      details: details[index]?.message || {},
    }));

    return res.status(200).json({
      status: "success",
      page,
      limit,
      totalProfiles,
      totalPages: Math.ceil(totalProfiles / limit),
      data: result,
    });
  } catch (error) {
    console.error("Profile API Error:", error.message);

    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};