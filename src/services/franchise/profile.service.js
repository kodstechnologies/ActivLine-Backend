import axios from "axios";
import Franchise from "../../models/Franchise/franchise.model.js";
import { fetchProfileDetails } from "./profileDetails.service.js";
import { getGroupDetails } from "./groupDetails.service.js";

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

export const fetchProfilesWithDetailsByFranchise = async (accountId, options = {}) => {
  const baseOptions = { ...options };
  const shouldFilterByDetailsType = Boolean(options.typeFromDetails && options.type);
  if (shouldFilterByDetailsType) {
    // defer type filtering until after details are loaded
    delete baseOptions.type;
  }
  const base = await fetchProfilesByFranchise(accountId, baseOptions);

  const getProfileId = (entry) => {
    const profile = entry?.Profile || entry || {};
    return profile.id || profile.profileId || profile.ProfileId || null;
  };

  const GROUP_ID_KEYS = [
    "groupId",
    "groupID",
    "group_id",
    "Group_id",
    "userGroupId",
    "Group ID",
    "Group Id",
  ];
  const PROFILE_ID_KEYS = [
    "profileId",
    "profileID",
    "profile_id",
    "Profile_id",
    "Profile Id",
    "activlineUserId",
  ];

  const normalizeText = (value) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text || null;
  };

  const normalizeKey = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const extractTextByKeys = (value, keys) => {
    if (!value || typeof value !== "object") return null;

    const normalizedTargetKeys = keys.map((k) => normalizeKey(k));

    for (const [key, raw] of Object.entries(value)) {
      if (raw === undefined || raw === null) continue;
      if (!normalizedTargetKeys.includes(normalizeKey(key))) continue;

      const asString = String(raw).trim();
      if (asString) return asString;
    }

    // Support rows like: { property: "Group ID", value: "..." }
    if (
      value.property !== undefined &&
      value.value !== undefined &&
      value.value !== null
    ) {
      const normalizedProperty = normalizeKey(value.property);

      if (normalizedTargetKeys.includes(normalizedProperty)) {
        const asString = String(value.value).trim();
        if (asString) return asString;
      }
    }

    for (const child of Object.values(value)) {
      if (child && typeof child === "object") {
        const found = extractTextByKeys(child, keys);
        if (found) return found;
      }
    }

    return null;
  };

  const extractRowsFromGroupDetails = (payload) => {
    if (!payload) return [];

    const candidateRoots = [
      payload?.data?.data,
      payload?.data,
      payload?.message?.data,
      payload?.message,
      payload,
    ];

    for (const candidate of candidateRoots) {
      if (Array.isArray(candidate)) return candidate;
      if (candidate && typeof candidate === "object") {
        for (const value of Object.values(candidate)) {
          if (Array.isArray(value)) return value;
        }
      }
    }

    return [];
  };

  const resolveGroupMapping = async () => {
    try {
      const groupDetailsRes = await getGroupDetails(accountId);
      const rows = extractRowsFromGroupDetails(groupDetailsRes);

      const profileIdToGroupId = new Map();
      const groupIds = new Set();

      for (const row of rows) {
        const groupId = normalizeText(extractTextByKeys(row, GROUP_ID_KEYS));
        const profileId = normalizeText(extractTextByKeys(row, PROFILE_ID_KEYS));

        if (groupId) groupIds.add(groupId);
        if (groupId && profileId && !profileIdToGroupId.has(profileId)) {
          profileIdToGroupId.set(profileId, groupId);
        }
      }

      return {
        profileIdToGroupId,
        groupIds: Array.from(groupIds),
      };
    } catch {
      return {
        profileIdToGroupId: new Map(),
        groupIds: [],
      };
    }
  };

  const propertiesToHide = new Set([
    "Reset billing cycle",
    "Day of the month to reset billing cycle",
    "Pricing Type",
    "Rate",
  ]);

  const filterPropertyArray = (arr) =>
    Array.isArray(arr)
      ? arr.filter(
          (item) =>
            !(
              item &&
              typeof item === "object" &&
              "property" in item &&
              propertiesToHide.has(String(item.property))
            )
        )
      : arr;

  const sanitizeDetails = (value) => {
    if (Array.isArray(value)) {
      const filtered = filterPropertyArray(value);
      return filtered.map((item) => sanitizeDetails(item));
    }
    if (value && typeof value === "object") {
      const next = {};
      for (const [key, val] of Object.entries(value)) {
        next[key] = sanitizeDetails(val);
      }
      return next;
    }
    return value;
  };

  const normalizeDetails = (details) => {
    const base = details?.message || details?.data || details || {};
    return sanitizeDetails(base);
  };

  const resolvePackageType = (details) => {
    const normalized = normalizeDetails(details);
    const profileDetails =
      normalized?.["profile Details"] ||
      normalized?.["profile details"] ||
      normalized?.profileDetails ||
      normalized?.profile_details ||
      [];

    if (!Array.isArray(profileDetails)) return null;

    const row = profileDetails.find(
      (item) =>
        String(item?.property || "").toLowerCase().trim() === "package type"
    );

    const value = String(row?.value || "").trim().toLowerCase();
    return value || null;
  };

  const groupMapping = await resolveGroupMapping();
  const getGroupIdForProfile = (profileId) => {
    const normalizedProfileId = normalizeText(profileId);
    if (!normalizedProfileId) return null;

    const mapped = groupMapping.profileIdToGroupId.get(normalizedProfileId);
    if (mapped) return mapped;

    if (groupMapping.groupIds.length === 1) return groupMapping.groupIds[0];

    return null;
  };

  const resolveGroupId = (profileId, existingGroupId) =>
    getGroupIdForProfile(profileId) || normalizeText(existingGroupId) || null;

  if (base.isSingle) {
    if (!base.item) return base;

    const profileId = getProfileId(base.item);
    const details = profileId
      ? await fetchProfileDetails(accountId, profileId)
      : null;

    if (shouldFilterByDetailsType) {
      const typeFilters = String(options.type || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      const packageType = resolvePackageType(details);
      if (typeFilters.length > 0 && !typeFilters.includes(packageType)) {
        return {
          ...base,
          item: null,
          total: 0,
        };
      }
    }

    return {
      ...base,
      item: {
        ...base.item,
        Profile: {
          ...(base.item.Profile || {}),
          groupId: resolveGroupId(profileId, base.item.Profile?.groupId),
        },
        details: normalizeDetails(details),
      },
    };
  }

  const itemsWithDetails = await Promise.all(
    base.items.map(async (entry) => {
      const profileId = getProfileId(entry);
      const details = profileId
        ? await fetchProfileDetails(accountId, profileId)
        : null;

      return {
        ...entry,
        Profile: {
          ...(entry.Profile || {}),
          groupId: resolveGroupId(profileId, entry.Profile?.groupId),
        },
        details: normalizeDetails(details),
      };
    })
  );

  if (shouldFilterByDetailsType) {
    const typeFilters = String(options.type || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    const filtered = itemsWithDetails.filter((entry) => {
      const packageType = resolvePackageType(entry.details);
      return typeFilters.length === 0 || typeFilters.includes(packageType);
    });

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
  }

  return {
    ...base,
    items: itemsWithDetails,
  };
};
