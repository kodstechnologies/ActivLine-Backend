import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import ApiError from "../../utils/ApiError.js";
import Customer from "../../models/Customer/customer.model.js";
import PaymentHistory from "../../models/payment/paymentHistory.model.js";
import {
  fetchProfilesByFranchise,
  fetchProfilesWithDetailsByFranchise,
} from "../../services/franchise/profile.service.js";

const normalizeText = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const shouldHideProperty = (property, value) => {
  const normalizedProperty = normalizeText(property).toLowerCase();
  const normalizedValue = normalizeText(value).toLowerCase();

  const hiddenProperties = new Set([
    "reset billing cycle",
    "day of the month to reset billing cycle",
    "simultaneous devices",
    "pricing type",
    "rate",
  ]);

  if (hiddenProperties.has(normalizedProperty)) return true;

  if (normalizedProperty === "description") {
    return normalizedValue === "cgst" || normalizedValue === "sgst";
  }

  return false;
};

const sanitizeDetails = (details) => {
  if (Array.isArray(details)) {
    return details
      .filter(
        (item) =>
          !(
            item &&
            typeof item === "object" &&
            "property" in item &&
            shouldHideProperty(item.property, item.value)
          )
      )
      .map((item) => sanitizeDetails(item));
  }

  if (details && typeof details === "object") {
    const next = {};
    for (const [key, value] of Object.entries(details)) {
      next[key] = sanitizeDetails(value);
    }
    return next;
  }

  return details;
};

const resolveCustomerForToken = async (tokenCustomerId, paramId) => {
  if (!tokenCustomerId) {
    throw new ApiError(401, "Unauthorized");
  }

  if (!paramId || String(paramId) === String(tokenCustomerId)) {
    return Customer.findById(tokenCustomerId).lean();
  }

  const byActivline = await Customer.findOne({
    activlineUserId: String(paramId),
  })
    .select("_id accountId userGroupId activlineUserId")
    .lean();

  if (!byActivline || String(byActivline._id) !== String(tokenCustomerId)) {
    throw new ApiError(403, "Access denied");
  }

  return Customer.findById(tokenCustomerId).lean();
};

const formatToIST = (dateValue) => {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);

  return `${formatted.replace(",", "")} IST`;
};

export const getCustomerProfiles = asyncHandler(async (req, res) => {
  const tokenCustomerId = req.user?._id;
  const paramId = req.params?.customerId;

  const customer = await resolveCustomerForToken(tokenCustomerId, paramId);
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  const includeDetails = ["1", "true", "yes"].includes(
    String(req.query.includeDetails || "").toLowerCase()
  );

  const { page, limit, search, type, profileId: profileIdFromQuery, id } =
    req.query || {};
  const profileId = profileIdFromQuery || id;

  const accountId = normalizeText(customer.accountId);
  if (!accountId) {
    throw new ApiError(400, "Customer accountId is missing");
  }

  const profileResult = await (includeDetails
    ? fetchProfilesWithDetailsByFranchise
    : fetchProfilesByFranchise)(accountId, {
    page,
    limit,
    search,
    type,
    profileId,
  });

  const paymentQuery = {
    status: "SUCCESS",
    $or: [
      customer.activlineUserId ? { profileId: customer.activlineUserId } : null,
      customer.accountId ? { accountId: customer.accountId } : null,
      customer.userGroupId ? { groupId: String(customer.userGroupId) } : null,
    ].filter(Boolean),
  };

  const latestPurchase = await PaymentHistory.findOne(paymentQuery)
    .sort({ paidAt: -1, createdAt: -1 })
    .lean();

  const latestPurchasePayload = latestPurchase
    ? {
        paymentId: String(latestPurchase._id),
        status: latestPurchase.status,
        amount: latestPurchase.planAmount,
        currency: latestPurchase.currency,
        paidAt: formatToIST(latestPurchase.paidAt),
        createdAt: formatToIST(latestPurchase.createdAt),
        profileId: latestPurchase.profileId,
        planName: latestPurchase.planName,
        planDetails: latestPurchase.planDetails || {},
      }
    : null;

  if (profileResult.isSingle) {
    return res.status(200).json(
      ApiResponse.success(
        {
          latestPurchase: latestPurchasePayload,
          profile: profileResult.item
            ? {
                ...profileResult.item,
                details: sanitizeDetails(profileResult.item.details),
              }
            : null,
        },
        "Customer profiles fetched successfully"
      )
    );
  }

  const sanitizedProfiles = (profileResult.items || []).map((item) => ({
    ...item,
    details: sanitizeDetails(item.details),
  }));

  return res.status(200).json(
    ApiResponse.success(
      {
        latestPurchase: latestPurchasePayload,
        profiles: sanitizedProfiles,
      },
      "Customer profiles fetched successfully",
      profileResult.meta
    )
  );
});
