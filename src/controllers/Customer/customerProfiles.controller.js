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
  let date = new Date(dateValue);
  if (Number.isNaN(date.getTime()) && typeof dateValue === "string") {
    date = new Date(dateValue.replace(" ", "T"));
  }
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

  // 🔒 Ensure the customer's current active plan is ALWAYS included in the list.
  // This handles the case where the plan falls outside the current page window
  // (e.g. limit=20 and the plan is at index 179).
  const customerCurrentProfileId = normalizeText(
    customer.profileId || customer.rawPayload?.profile_id || ""
  );
  if (
    !profileResult.isSingle &&
    !profileId &&
    customerCurrentProfileId &&
    Array.isArray(profileResult.items)
  ) {
    const alreadyPresent = profileResult.items.some(
      (entry) =>
        normalizeText(
          entry?.Profile?.id || entry?.id || ""
        ) === customerCurrentProfileId
    );

    if (!alreadyPresent) {
      try {
        // Fetch only this specific profile and prepend it.
        const currentPlanResult = await (includeDetails
          ? fetchProfilesWithDetailsByFranchise
          : fetchProfilesByFranchise)(accountId, {
          profileId: customerCurrentProfileId,
        });
        if (currentPlanResult.isSingle && currentPlanResult.item) {
          profileResult.items.unshift(currentPlanResult.item);
          if (profileResult.meta) {
            profileResult.meta.total = (profileResult.meta.total || 0) + 1;
          }
        }
      } catch {
        // Non-fatal: proceed without pinning
      }
    }
  }

  const customerPaymentQuery = {
    status: "SUCCESS",
    $or: [
      customer._id ? { paidByCustomerId: customer._id } : null,
      customer.phoneNumber ? { paidByPhone: customer.phoneNumber } : null,
      customer.userName ? { paidByUserName: customer.userName } : null,
      customer.emailId ? { paidByEmail: customer.emailId } : null,
    ].filter(Boolean),
  };

  const latestPurchase = customerPaymentQuery.$or.length
    ? await PaymentHistory.findOne(customerPaymentQuery)
        .sort({ paidAt: -1, createdAt: -1 })
        .lean()
    : null;

  const parseDateSafe = (val) => {
    if (!val) return null;
    if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
    let d = new Date(val);
    if (Number.isNaN(d.getTime()) && typeof val === "string") {
      d = new Date(val.replace(" ", "T"));
    }
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const razorpayDate = latestPurchase
    ? parseDateSafe(latestPurchase.paidAt || latestPurchase.createdAt)
    : null;

  const hasJazePlan = Boolean(
    customer.profileId ||
      customer.planName ||
      customer.rawPayload?.profile_id ||
      customer.lastPaidDate ||
      customer.activationDate
  );

  const jazeStartDate =
    customer.activationDate ||
    customer.rawPayload?.activationTime ||
    customer.rawPayload?.billingStartDate ||
    null;
  const jazeEndDate =
    customer.expirationDate ||
    customer.rawPayload?.expirationTime ||
    customer.rawPayload?.billingEndDate ||
    null;
  const jazePaidAt = customer.lastPaidDate || jazeStartDate || customer.createdAt;
  const jazeDate = hasJazePlan ? parseDateSafe(jazePaidAt) : null;

  // Pick whichever is newer: Razorpay or JAZE
  const preferRazorpay =
    latestPurchase &&
    (!jazeDate || (razorpayDate && razorpayDate.getTime() >= jazeDate.getTime()));

  let latestPurchasePayload = null;

  if (preferRazorpay) {
    latestPurchasePayload = {
      paymentId: String(latestPurchase._id),
      status: latestPurchase.status,
      amount: latestPurchase.planAmount,
      currency: latestPurchase.currency,
      paidAt: formatToIST(latestPurchase.paidAt),
      createdAt: formatToIST(latestPurchase.createdAt),
      profileId: latestPurchase.profileId,
      planName: latestPurchase.planName,
      planDetails: latestPurchase.planDetails || {},
    };
  } else if (hasJazePlan) {
    const profileId =
      customer.profileId || customer.rawPayload?.profile_id || "";
    const planName =
      customer.rawPayload?.group_name ||
      customer.profileName ||
      customer.planName ||
      (profileId ? `Plan ${profileId}` : "Current Plan");
    let amount = customer.planAmount ? Number(customer.planAmount) : null;
    if (!amount || amount <= 0) {
      const allProfiles = profileResult.items || (profileResult.item ? [profileResult.item] : []);
      for (const item of allProfiles) {
        const pId = String(item?.Profile?.id || item?.id || "").trim();
        const pName = String(item?.Profile?.name || item?.name || "").trim().toLowerCase();
        const billingDetails =
          item?.details?.["billing Details"] || item?.details?.billingDetails || [];
        const billingPlanIdProp = Array.isArray(billingDetails)
          ? billingDetails.find(
              (d) => String(d?.property || "").toLowerCase() === "billingplanid",
            )
          : null;
        const bPlanId = billingPlanIdProp
          ? String(billingPlanIdProp.value || "").trim()
          : "";

        const isMatch =
          (profileId &&
            (pId === String(profileId) || bPlanId === String(profileId))) ||
          (planName &&
            pName &&
            (planName.toLowerCase().includes(pName) ||
              pName.includes(planName.toLowerCase())));

        if (isMatch && Array.isArray(billingDetails)) {
          const priceProp = billingDetails.find((d) =>
            ["total price", "price", "rate", "amount"].includes(
              String(d?.property || "").trim().toLowerCase(),
            ),
          );
          if (
            priceProp &&
            priceProp.value !== undefined &&
            priceProp.value !== null
          ) {
            const parsed = parseFloat(
              String(priceProp.value).replace(/[^0-9.]/g, ""),
            );
            if (!Number.isNaN(parsed) && parsed > 0) {
              amount = parsed;
              break;
            }
          }
        }
      }
    }

    latestPurchasePayload = {
      paymentId: null,
      source: "JAZE",
      status: "SUCCESS",
      amount: amount,
      currency: "INR",
      paidAt: formatToIST(jazePaidAt),
      createdAt: formatToIST(customer.createdAt),
      profileId: String(profileId),
      planName: planName,
      planDetails: {
        calculatedStartDate: jazeStartDate ? String(jazeStartDate).split(" ")[0] : null,
        calculatedEndDate: jazeEndDate ? String(jazeEndDate).split(" ")[0] : null,
      },
    };
  }

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
