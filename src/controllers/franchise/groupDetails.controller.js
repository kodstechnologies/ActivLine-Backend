import { getGroupDetails } from "../../services/franchise/groupDetails.service.js";

export const fetchGroupDetails = async (req, res, next) => {
  try {
    const { accountId, search } = req.query;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: "accountId is required",
      });
    }

    const data = await getGroupDetails(accountId);

    if (search) {
      const searchStr = String(search).toLowerCase().trim();
      if (data && Array.isArray(data.data)) {
        data.data = data.data.filter(g => 
          String(g.Group_name || "").toLowerCase().includes(searchStr) ||
          String(g.Group_id || "").toLowerCase().includes(searchStr) ||
          String(g.Profile_Name || "").toLowerCase().includes(searchStr)
        );
      } else if (Array.isArray(data)) {
        const filtered = data.filter(g => 
          String(g.Group_name || "").toLowerCase().includes(searchStr) ||
          String(g.Group_id || "").toLowerCase().includes(searchStr) ||
          String(g.Profile_Name || "").toLowerCase().includes(searchStr)
        );
        return res.status(200).json({
          success: true,
          data: filtered,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};
