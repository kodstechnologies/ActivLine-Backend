import axios from "axios";
import Franchise from "../../models/Franchise/franchise.model.js";

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeProfileEntry = (entry) => entry?.Profile || entry || {};

const pickProfileType = (profile) =>
  profile?.type ||
  profile?.profileType ||
  profile?.planType ||
  profile?.serviceType ||
  null;

export const fetchProfilesByFranchise = async (accountId, options = {}) => {

  // get franchise from DB
  const franchise = await Franchise.findOne({ accountId });

  if (!franchise) {
    throw new Error("Franchise not found");
  }

  const username = franchise.accountName;
  const password = franchise.apiKey;

  const basicAuth = Buffer
    .from(`${username}:${password}`)
    .toString("base64");

  const response = await axios.get(
    "https://live.activline.in/api/v1/get_all_profile_ids",
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
    }
  );

  const payload = response?.data;
  const listCandidate =
    (Array.isArray(payload?.data) && payload.data) ||
    (Array.isArray(payload?.Data) && payload.Data) ||
    (Array.isArray(payload?.profiles) && payload.profiles) ||
    (Array.isArray(payload?.Profiles) && payload.Profiles) ||
    (Array.isArray(payload?.result) && payload.result) ||
    (Array.isArray(payload?.results) && payload.results) ||
    (Array.isArray(payload) && payload) ||
    (Array.isArray(response?.data?.data) && response.data.data) ||
    [];

  const list = listCandidate;
  const normalizedList = list.map((entry) => {
    const profile = normalizeProfileEntry(entry);
    return { Profile: profile };
  });

  const search = String(options.search || "").trim().toLowerCase();
  const rawType = String(options.type || "").trim();
  const typeFilters = rawType
    ? rawType
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const profileId = options.profileId ? String(options.profileId).trim() : "";

  const filtered = normalizedList.filter((entry) => {
    const profile = entry.Profile || {};
    const id = String(profile.id || "");
    const name = String(profile.name || "").toLowerCase();
    const type = String(pickProfileType(profile) || "").toLowerCase();

    if (profileId && id !== profileId) return false;
    if (search && !name.includes(search)) return false;
    if (typeFilters.length > 0 && !typeFilters.includes(type)) return false;

    return true;
  });

  if (profileId) {
    return {
      isSingle: true,
      item: filtered[0] || null,
      total: filtered.length,
    };
  }

  const page = toPositiveInt(options.page, 1);
  const limit = Math.min(toPositiveInt(options.limit, 20), 200);
  const total = filtered.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const skip = (page - 1) * limit;
  const items = filtered.slice(skip, skip + limit);

  return {
    isSingle: false,
    items,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};
