import PaymentHistory from "../../models/payment/paymentHistory.model.js";
import Customer from "../../models/Customer/customer.model.js";
import { getSubPlans } from "../franchise/subPlan.service.js";
import { getGroupDetails } from "../franchise/groupDetails.service.js";
import {
  getAllProfileIds,
  getProfileDetails,
} from "../../external/activline/activline.profile.api.js";
import ApiError from "../../utils/ApiError.js";

const normalizeText = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const pickFirst = (obj, keys) => {
  if (!obj || typeof obj !== "object") return "";
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
};

const extractPlansFromSubPlans = (payload) => {
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

const extractRowsFromGroupDetails = (payload) => {
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

const GROUP_ID_KEYS = [
  "groupId",
  "groupID",
  "group_id",
  "Group_id",
  "Group ID",
  "Group Id",
  "userGroupId",
];

const PROFILE_ID_KEYS = [
  "profileId",
  "profileID",
  "profile_id",
  "Profile_id",
  "Profile Id",
  "activlineUserId",
];

const BILLING_PLAN_ID_KEYS = [
  "billingPlanId",
  "billing_plan_id",
  "billingPlanID",
  "BillPlanId",
  "planId",
  "planID",
  "plan_id",
];

const PLAN_NAME_KEYS = [
  "planName",
  "plan_name",
  "name",
  "Plan Name",
  "plan",
];

const extractTextByKeys = (row, keys) => {
  if (!row || typeof row !== "object") return "";
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      const value = normalizeText(row[key]);
      if (value) return value;
    }
  }
  if (row?.property !== undefined && row?.value !== undefined) {
    const normalizedProperty = normalizeText(row.property)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const normalizedKeys = keys.map((k) =>
      normalizeText(k).toLowerCase().replace(/[^a-z0-9]/g, "")
    );
    if (normalizedKeys.includes(normalizedProperty)) {
      return normalizeText(row.value);
    }
  }
  return "";
};

const extractGroupIdsFromRows = (rows) => {
  const ids = new Set();
  for (const row of rows || []) {
    for (const key of GROUP_ID_KEYS) {
      if (row?.[key] !== undefined && row?.[key] !== null) {
        const value = normalizeText(row[key]);
        if (value) ids.add(value);
      }
    }
    if (row?.property && row?.value) {
      const normalizedProperty = normalizeText(row.property)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const normalizedKeys = GROUP_ID_KEYS.map((k) =>
        normalizeText(k).toLowerCase().replace(/[^a-z0-9]/g, "")
      );
      if (normalizedKeys.includes(normalizedProperty)) {
        const value = normalizeText(row.value);
        if (value) ids.add(value);
      }
    }
  }
  return Array.from(ids);
};

const extractBillingPlanId = (details) => {
  const billingRows = Array.isArray(details?.["billing Details"])
    ? details["billing Details"]
    : [];

  for (const row of billingRows) {
    if (!row) continue;
    const property = normalizeText(row.property).toLowerCase();
    if (property === "billingplanid") {
      return normalizeText(row.value);
    }
  }
  return "";
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export const getCustomerPlanSummary = async (customerId) => {
  const customer = await Customer.findById(customerId).lean();
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  const accountId = normalizeText(customer.accountId);
  const groupId = normalizeText(customer.userGroupId);
  const profileId = normalizeText(customer.activlineUserId);

  if (!groupId) {
    throw new ApiError(400, "Customer groupId is missing");
  }

  const paymentQuery = {
    status: "SUCCESS",
    $or: [
      profileId ? { profileId } : null,
      accountId ? { accountId } : null,
      groupId ? { groupId } : null,
    ].filter(Boolean),
  };

  const latestPaymentPromise = PaymentHistory.findOne(paymentQuery)
    .sort({ paidAt: -1, createdAt: -1 })
    .lean();

  let groupIds = groupId ? [groupId] : [];
  let groupDetailRows = [];
  if (accountId) {
    try {
      const groupDetails = await getGroupDetails(accountId);
      groupDetailRows = extractRowsFromGroupDetails(groupDetails);
      const extracted = extractGroupIdsFromRows(groupDetailRows);
      if (extracted.length) groupIds = extracted;
    } catch {
      // fallback to customer groupId only
    }
  }

  const subPlanResponses = await Promise.all(
    groupIds.map((id) => getSubPlans(id))
  );
  const availablePlans = subPlanResponses
    .map((res) => extractPlansFromSubPlans(res))
    .flat();

  const latestPayment = await latestPaymentPromise;
  const latestProfileId = normalizeText(latestPayment?.profileId);
  const latestPlanNameKey = normalizeText(latestPayment?.planName).toLowerCase();

  const profileIdByBillingPlanId = new Map();
  const profileIdByPlanName = new Map();
  for (const row of groupDetailRows) {
    const profileIdFromRow = extractTextByKeys(row, PROFILE_ID_KEYS);
    if (!profileIdFromRow) continue;

    const billingPlanId = extractTextByKeys(row, BILLING_PLAN_ID_KEYS);
    const planName = extractTextByKeys(row, PLAN_NAME_KEYS);

    if (billingPlanId && !profileIdByBillingPlanId.has(billingPlanId)) {
      profileIdByBillingPlanId.set(billingPlanId, profileIdFromRow);
    }
    if (planName) {
      const key = planName.toLowerCase();
      if (!profileIdByPlanName.has(key)) {
        profileIdByPlanName.set(key, profileIdFromRow);
      }
    }
  }

  const uniqueProfileIds = Array.from(
    new Set(
      availablePlans
        .map((plan) => {
          const billPlan = plan?.BillPlan && typeof plan.BillPlan === "object" ? plan.BillPlan : null;
          const rawId =
            pickFirst(plan, [
              "profileId",
              "profileID",
              "profile_id",
              "id",
              "planId",
              "planID",
              billPlan ? "id" : "",
            ]) ||
            billPlan?.id ||
            "";

          const billPlanId = normalizeText(billPlan?.id || "");
          const planName = normalizeText(billPlan?.name || "");
          const mappedId =
            (billPlanId && profileIdByBillingPlanId.get(billPlanId)) ||
            (planName && profileIdByPlanName.get(planName.toLowerCase())) ||
            "";

          return normalizeText(rawId) || normalizeText(mappedId);
        })
        .map((id) => normalizeText(id))
        .filter(Boolean)
    )
  );

  const profileDetailsEntries = await Promise.all(
    uniqueProfileIds.map(async (id) => {
      try {
        const res = await getProfileDetails(id);
        const details = res?.message || res || {};
        return [id, details];
      } catch {
        return [id, null];
      }
    })
  );
  const profileDetailsMap = new Map(profileDetailsEntries);

  const hasMissingDetails = availablePlans.some((plan) => {
    const billPlan = plan?.BillPlan && typeof plan.BillPlan === "object" ? plan.BillPlan : null;
    const planName = normalizeText(
      pickFirst(plan, ["name", "planName", "profileName", "plan"]) ||
        billPlan?.name ||
        ""
    ).toLowerCase();
    const planProfileId = normalizeText(
      pickFirst(plan, [
        "profileId",
        "profileID",
        "profile_id",
        "id",
        "planId",
        "planID",
        billPlan ? "id" : "",
      ]) || billPlan?.id || ""
    );
    const mappedProfileId =
      (planProfileId && profileIdByBillingPlanId.get(planProfileId)) ||
      (billPlan?.id && profileIdByBillingPlanId.get(String(billPlan.id))) ||
      (billPlan?.name && profileIdByPlanName.get(String(billPlan.name).toLowerCase())) ||
      "";
    const effectiveProfileId = normalizeText(planProfileId) || normalizeText(mappedProfileId);
    if (effectiveProfileId && profileDetailsMap.get(effectiveProfileId)) return false;
    return Boolean(planName);
  });

  let profileIdByPlanNameFromProfiles = new Map();
  if (hasMissingDetails) {
    try {
      const profilesRes = await getAllProfileIds();
      const profileList = Array.isArray(profilesRes)
        ? profilesRes
        : profilesRes?.data || profilesRes?.message || [];
      const rows = Array.isArray(profileList) ? profileList : [];
      for (const row of rows) {
        const profile = row?.Profile || row;
        if (!profile) continue;
        const name = normalizeText(profile.name || profile.profileName || "").toLowerCase();
        const id = normalizeText(profile.id || profile.profileId || "");
        if (name && id && !profileIdByPlanNameFromProfiles.has(name)) {
          profileIdByPlanNameFromProfiles.set(name, id);
        }
      }
    } catch {
      profileIdByPlanNameFromProfiles = new Map();
    }
  }

  const missingProfileIds = new Set();
  const preparedPlans = availablePlans.map((plan) => {
    const billPlan = plan?.BillPlan && typeof plan.BillPlan === "object" ? plan.BillPlan : null;
    const planProfileId = pickFirst(plan, [
      "profileId",
      "profileID",
      "profile_id",
      "id",
      "planId",
      "planID",
      billPlan ? "id" : "",
    ]);
    const planName = pickFirst(plan, [
      "name",
      "planName",
      "profileName",
      "plan",
      billPlan ? "name" : "",
    ]);
    const planNameKey = planName.toLowerCase();

    const isLatestMatch =
      (planProfileId && latestProfileId && planProfileId === latestProfileId) ||
      (planNameKey && latestPlanNameKey && planNameKey === latestPlanNameKey);

    const mappedProfileId =
      (planProfileId && profileIdByBillingPlanId.get(planProfileId)) ||
      (billPlan?.id && profileIdByBillingPlanId.get(String(billPlan.id))) ||
      (billPlan?.name && profileIdByPlanName.get(String(billPlan.name).toLowerCase())) ||
      (billPlan?.name &&
        profileIdByPlanNameFromProfiles.get(String(billPlan.name).toLowerCase())) ||
      (planNameKey && profileIdByPlanNameFromProfiles.get(planNameKey)) ||
      "";

    const effectiveProfileId = normalizeText(planProfileId) || normalizeText(mappedProfileId);

    if (effectiveProfileId && !profileDetailsMap.get(effectiveProfileId)) {
      missingProfileIds.add(effectiveProfileId);
    }

    return {
      billPlan,
      plan,
      planProfileId,
      planName,
      planNameKey,
      effectiveProfileId,
      isLatestMatch,
    };
  });

  if (missingProfileIds.size) {
    const fetchedEntries = await Promise.all(
      Array.from(missingProfileIds).map(async (id) => {
        try {
          const res = await getProfileDetails(id);
          const details = res?.message || res || null;
          return [id, details];
        } catch {
          return [id, null];
        }
      })
    );
    for (const [id, details] of fetchedEntries) {
      if (details) profileDetailsMap.set(id, details);
    }
  }

  const plansNeedingDetails = availablePlans.filter((plan) => {
    const billPlan = plan?.BillPlan && typeof plan.BillPlan === "object" ? plan.BillPlan : null;
    const planName = normalizeText(
      pickFirst(plan, ["name", "planName", "profileName", "plan"]) ||
        billPlan?.name ||
        ""
    ).toLowerCase();
    const planProfileId = normalizeText(
      pickFirst(plan, [
        "profileId",
        "profileID",
        "profile_id",
        "id",
        "planId",
        "planID",
        billPlan ? "id" : "",
      ]) || billPlan?.id || ""
    );
    const mappedProfileId =
      (planProfileId && profileIdByBillingPlanId.get(planProfileId)) ||
      (billPlan?.id && profileIdByBillingPlanId.get(String(billPlan.id))) ||
      (billPlan?.name && profileIdByPlanName.get(String(billPlan.name).toLowerCase())) ||
      (billPlan?.name &&
        profileIdByPlanNameFromProfiles.get(String(billPlan.name).toLowerCase())) ||
      (planName && profileIdByPlanNameFromProfiles.get(planName)) ||
      "";
    const effectiveProfileId = normalizeText(planProfileId) || normalizeText(mappedProfileId);
    if (!effectiveProfileId) return true;
    const details = profileDetailsMap.get(effectiveProfileId);
    return !details;
  });

  if (plansNeedingDetails.length) {
    try {
      const allProfilesRes = await getAllProfileIds();
      const profileList = Array.isArray(allProfilesRes)
        ? allProfilesRes
        : allProfilesRes?.data || allProfilesRes?.message || [];
      const rows = Array.isArray(profileList) ? profileList : [];
      const allProfileIds = rows
        .map((row) => row?.Profile || row)
        .map((profile) => normalizeText(profile?.id || profile?.profileId || ""))
        .filter(Boolean);

      const uniqueAllProfileIds = Array.from(new Set(allProfileIds));
      const chunks = chunkArray(uniqueAllProfileIds, 10);
      const billingPlanIdToProfile = new Map();

      for (const chunk of chunks) {
        const detailsBatch = await Promise.all(
          chunk.map(async (id) => {
            try {
              const res = await getProfileDetails(id);
              const details = res?.message || res || null;
              return [id, details];
            } catch {
              return [id, null];
            }
          })
        );

        for (const [id, details] of detailsBatch) {
          if (!details) continue;
          const billingPlanId = extractBillingPlanId(details);
          if (billingPlanId && !billingPlanIdToProfile.has(billingPlanId)) {
            billingPlanIdToProfile.set(billingPlanId, id);
          }
          if (!profileDetailsMap.has(id)) {
            profileDetailsMap.set(id, details);
          }
        }
      }

      for (const plan of availablePlans) {
        const billPlan = plan?.BillPlan && typeof plan.BillPlan === "object" ? plan.BillPlan : null;
        const billPlanId = normalizeText(billPlan?.id || "");
        if (!billPlanId) continue;
        const mappedProfileId = billingPlanIdToProfile.get(billPlanId);
        if (mappedProfileId && !profileIdByBillingPlanId.has(billPlanId)) {
          profileIdByBillingPlanId.set(billPlanId, mappedProfileId);
        }
      }
    } catch {
      // ignore fallback failures
    }
  }

  const merged = preparedPlans.map((item) => {
    const {
      billPlan,
      plan,
      planProfileId,
      planName,
      planNameKey,
      effectiveProfileId,
      isLatestMatch,
    } = item;

    const profileDetails =
      (effectiveProfileId && profileDetailsMap.get(effectiveProfileId)) || null;

    return {
      plan: {
        ...plan,
        profileId:
          effectiveProfileId ||
          planProfileId ||
          plan.profileId ||
          billPlan?.id ||
          null,
        planName: planName || plan.planName || billPlan?.name || null,
        details: profileDetails,
      },
      isPurchased: Boolean(latestPayment && isLatestMatch),
      purchase: latestPayment && isLatestMatch
        ? {
            paymentId: String(latestPayment._id),
            status: latestPayment.status,
            amount: latestPayment.planAmount,
            currency: latestPayment.currency,
            paidAt: latestPayment.paidAt,
            createdAt: latestPayment.createdAt,
            profileId: latestPayment.profileId,
            planName: latestPayment.planName,
            planDetails: latestPayment.planDetails || {},
          }
        : null,
    };
  });

  return {
    customer: {
      id: String(customer._id),
      accountId: customer.accountId || null,
      groupId: customer.userGroupId || null,
      activlineUserId: customer.activlineUserId || null,
    },
    latestPurchase: latestPayment
      ? {
          paymentId: String(latestPayment._id),
          status: latestPayment.status,
          amount: latestPayment.planAmount,
          currency: latestPayment.currency,
          paidAt: latestPayment.paidAt,
          createdAt: latestPayment.createdAt,
          profileId: latestPayment.profileId,
          planName: latestPayment.planName,
          planDetails: latestPayment.planDetails || {},
        }
      : null,
    plans: merged,
  };
};
