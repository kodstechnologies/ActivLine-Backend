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

    if (process.env.DEBUG_ACTIVLINE === "true") {
      const sample =
        (Array.isArray(response) && response[0]) ||
        (Array.isArray(response?.data) && response.data[0]) ||
        (Array.isArray(response?.data?.data) && response.data.data[0]) ||
        response;
      console.log(
        "[getUserByPhoneDetails] sample response:",
        JSON.stringify(sample)?.slice(0, 2000)
      );
    }

    const groups =
      (Array.isArray(response) && response) ||
      (Array.isArray(response?.data) && response.data) ||
      (Array.isArray(response?.data?.data) && response.data.data) ||
      [];

    const normalizeUsername = (value) => String(value || "").trim().toUpperCase();
    const normalizeUserKey = (value) => {
      const text = normalizeUsername(value);
      if (!text) return null;
      if (!/^[A-Z]+[-_]\d+$/.test(text)) return null;
      const [letters, digits] = text.split(/[-_]/);
      if (!letters || !digits) return null;
      const normalizedDigits = digits.replace(/^0+/, "") || "0";
      return `${letters}-${normalizedDigits}`;
    };
    const extractUserFromGroup = (group) => {
      if (Array.isArray(group)) {
        const first = group[0];
        return first?.User || first?.user || null;
      }
      if (group && typeof group === "object") {
        return group.User || group.user || null;
      }
      return null;
    };

    const queryKey = username ? normalizeUserKey(username) : null;
    const canFilterByUser = queryKey
      ? groups.some((group) => {
          const user = extractUserFromGroup(group);
          const name = user?.username || user?.name || "";
          return Boolean(normalizeUserKey(name));
        })
      : false;

    const filtered =
      queryKey && canFilterByUser
        ? groups.filter((group) => {
            const user = extractUserFromGroup(group);
            const name = user?.username || user?.name || "";
            const userKey = normalizeUserKey(name);
            if (!userKey) return false;
            return userKey === queryKey;
          })
        : groups;

    const extracted = (filtered || [])
      .map((group) => {
        if (Array.isArray(group)) {
          // Return the full group when possible so the response keeps all fields.
          return group;
        }
        if (group && typeof group === "object") {
          return group;
        }
        return null;
      })
      .filter(Boolean);

    return res.status(200).json({ data: extracted });
  } catch (err) {
    next(err);
  }
};
