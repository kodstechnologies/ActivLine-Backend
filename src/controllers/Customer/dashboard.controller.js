import {
  getUsageSummary,
  getUserSessionDetailsRaw,
  getUserByPhoneRaw,
} from "../../services/Customer/dashboar.services.js";

export const getUserUsage = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { fromDate, toDate } = req.query;

    const data = await getUsageSummary(userId, fromDate, toDate);

    res.json({
      status: "success",
      data,
    });
  } catch (err) {
    next(err);
  }
};

export const getUserSessionDetails = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { fromDate, toDate } = req.query;

    const response = await getUserSessionDetailsRaw(userId, fromDate, toDate);
    const statusCode =
      typeof response?.errorCode === "number" ? response.errorCode : 200;

    res.status(statusCode).json(response);
  } catch (err) {
    next(err);
  }
};

export const getUserByPhoneDetails = async (req, res, next) => {
  try {
    const { phone } = req.params;
    const { username } = req.query;

    const response = await getUserByPhoneRaw(phone);

    const groups = Array.isArray(response) ? response : [];

    const filtered = username
      ? groups.filter((group) => {
          const user = Array.isArray(group) ? group[0]?.User : null;
          const name = user?.username || user?.name || "";
          return String(name).toLowerCase() === String(username).trim().toLowerCase();
        })
      : groups;

    const extracted = (filtered || [])
      .map((group) => {
        if (!Array.isArray(group)) return null;
        const item = group.find((entry) => entry?.currentBillingCycleUsage);
        return item || null;
      })
      .filter(Boolean);

    return res.status(200).json({ data: extracted });
  } catch (err) {
    next(err);
  }
};
