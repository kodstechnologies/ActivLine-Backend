import { getGroupDetails } from "../../services/franchise/groupDetails.service.js";

export const fetchGroupDetails = async (req, res, next) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: "accountId is required",
      });
    }

    const data = await getGroupDetails(accountId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};
