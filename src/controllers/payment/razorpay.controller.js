import {
  createRazorpayOrder,
  getRazorpayPublicKey,
  verifyRazorpaySignature,
} from "../../services/payment/razorpay.service.js";
import { getProfileDetails } from "../../external/activline/activline.profile.api.js";
import { getGroupDetails } from "../../services/franchise/groupDetails.service.js";
import PaymentHistory from "../../models/payment/paymentHistory.model.js";
import Customer from "../../models/Customer/customer.model.js";

const AMOUNT_KEYS = [
  "amount",
  "price",
  "planAmount",
  "planPrice",
  "monthlyCharge",
  "monthly_price",
  "rate",
  "mrp",
];

const GROUP_ID_KEYS = ["groupId", "groupID", "group_id", "userGroupId"];
const ACCOUNT_ID_KEYS = ["accountId", "accountID", "account_id", "account"];
const PROFILE_ID_KEYS = [
  "profileId",
  "profileID",
  "profile_id",
  "Profile_id",
  "Profile Id",
  "activlineUserId",
];

const extractAmount = (value) => {
  if (!value || typeof value !== "object") return null;

  for (const key of AMOUNT_KEYS) {
    if (value[key] !== undefined && value[key] !== null) {
      const numeric = Number(value[key]);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }
    }
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const found = extractAmount(child);
      if (found) return found;
    }
  }

  return null;
};

const extractTextByKeys = (value, keys) => {
  if (!value || typeof value !== "object") return null;

  const normalizedTargetKeys = keys.map((k) =>
    String(k).toLowerCase().replace(/[^a-z0-9]/g, "")
  );

  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) {
      const asString = String(value[key]).trim();
      if (asString) {
        return asString;
      }
    }
  }

  // Support payloads that use rows like: { property: "Account ID", value: "..." }
  if (
    value.property !== undefined &&
    value.value !== undefined &&
    value.value !== null
  ) {
    const normalizedProperty = String(value.property)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (normalizedTargetKeys.includes(normalizedProperty)) {
      const asString = String(value.value).trim();
      if (asString) {
        return asString;
      }
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

const getBillingMeta = (planDetails = {}) => {
  const billingRows = Array.isArray(planDetails?.["billing Details"])
    ? planDetails["billing Details"]
    : [];

  const findValue = (propertyName) => {
    const row = billingRows.find(
      (item) =>
        String(item?.property || "").toLowerCase() ===
        String(propertyName).toLowerCase()
    );
    return row?.value ?? null;
  };

  return {
    billingPlanId: findValue("billingPlanId"),
    totalPrice: findValue("Total Price"),
  };
};

const extractAllTextByKeys = (value, keys, bag = new Set()) => {
  if (!value || typeof value !== "object") return bag;

  const normalizedTargetKeys = keys.map((k) =>
    String(k).toLowerCase().replace(/[^a-z0-9]/g, "")
  );

  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) {
      const asString = String(value[key]).trim();
      if (asString) bag.add(asString);
    }
  }

  if (
    value.property !== undefined &&
    value.value !== undefined &&
    value.value !== null
  ) {
    const normalizedProperty = String(value.property)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (normalizedTargetKeys.includes(normalizedProperty)) {
      const asString = String(value.value).trim();
      if (asString) bag.add(asString);
    }
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      extractAllTextByKeys(child, keys, bag);
    }
  }

  return bag;
};

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
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

const toCustomerSnapshot = (customer) => {
  if (!customer) {
    return {
      accountId: null,
      name: null,
      phoneNumber: null,
      email: null,
    };
  }

  const fullName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();

  return {
    accountId: customer.accountId || null,
    name: customer.userName || fullName || null,
    phoneNumber: customer.phoneNumber || null,
    email: customer.emailId || null,
  };
};

const buildCustomerResolver = async (paymentDocs) => {
  const keySet = new Set();

  for (const payment of paymentDocs) {
    const paymentObj = payment.toObject();
    [paymentObj.accountId, paymentObj.groupId, paymentObj.profileId].forEach((v) => {
      const key = normalizeText(v);
      if (key) keySet.add(key);
    });
  }

  const keys = Array.from(keySet);
  if (!keys.length) {
    return () => toCustomerSnapshot(null);
  }

  const numericGroupIds = keys
    .map((k) => Number(k))
    .filter((num) => Number.isFinite(num));

  const customers = await Customer.find({
    $or: [
      { accountId: { $in: keys } },
      { activlineUserId: { $in: keys } },
      { userGroupId: { $in: numericGroupIds } },
    ],
  })
    .select("userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId")
    .lean();

  const byAccountId = new Map();
  const byGroupId = new Map();
  const byActivlineUserId = new Map();

  for (const customer of customers) {
    const accountKey = normalizeText(customer.accountId);
    const groupKey = normalizeText(customer.userGroupId);
    const activlineKey = normalizeText(customer.activlineUserId);

    if (accountKey && !byAccountId.has(accountKey)) byAccountId.set(accountKey, customer);
    if (groupKey && !byGroupId.has(groupKey)) byGroupId.set(groupKey, customer);
    if (activlineKey && !byActivlineUserId.has(activlineKey)) byActivlineUserId.set(activlineKey, customer);
  }

  return (paymentDoc) => {
    const payment = paymentDoc.toObject();
    const accountId = normalizeText(payment.accountId);
    const groupId = normalizeText(payment.groupId);
    const profileId = normalizeText(payment.profileId);

    const customer =
      (accountId && byAccountId.get(accountId)) ||
      (groupId && byGroupId.get(groupId)) ||
      (groupId && byAccountId.get(groupId)) ||
      (groupId && byActivlineUserId.get(groupId)) ||
      (profileId && byActivlineUserId.get(profileId)) ||
      null;

    return toCustomerSnapshot(customer);
  };
};

const mapPaymentHistoryDoc = (doc, customer) => {
  const obj = doc.toObject();
  const billingMeta = getBillingMeta(obj.planDetails || {});
  const resolvedAccountId =
    normalizeText(obj.accountId) || normalizeText(customer?.accountId) || null;
  const resolvedCustomer = {
    ...(customer || toCustomerSnapshot(null)),
    accountId: resolvedAccountId,
  };

  return {
    paymentId: String(doc._id),
    orderId: obj.razorpayOrderId,
    razorpayPaymentId: obj.razorpayPaymentId,
    status: obj.status,
    isPaid: obj.status === "SUCCESS",
    amount: obj.planAmount,
    currency: obj.currency,
    groupId: obj.groupId,
    accountId: resolvedAccountId,
    profileId: obj.profileId,
    planName: obj.planName,
    paidAt: obj.paidAt,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    customer: resolvedCustomer,
    plan: {
      profileId: obj.profileId,
      planName: obj.planName,
      planAmount: obj.planAmount,
      billingPlanId: billingMeta.billingPlanId,
      totalPrice: billingMeta.totalPrice,
      details: obj.planDetails || {},
    },
  };
};

export const createOrder = async (req, res, next) => {
  try {
    const amount = Number(req.body?.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
      });
    }

    const key = getRazorpayPublicKey();

    if (!key) {
      return res.status(500).json({
        success: false,
        message: "Razorpay is not configured",
      });
    }

    const order = await createRazorpayOrder({
      amount,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    });

    return res.status(200).json({
      success: true,
      orderId: order.id,
      key,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    return next(error);
  }
};

export const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message:
          "razorpay_order_id, razorpay_payment_id and razorpay_signature are required",
      });
    }

    const isValid = verifyRazorpaySignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    return res.status(200).json({
      success: true,
      status: "success",
      message: "Payment verified successfully",
    });
  } catch (error) {
    return next(error);
  }
};

export const createPlanOrder = async (req, res, next) => {
  try {
    const { profileId } = req.params;
    const fallbackAmount = Number(req.body?.amount);

    if (!profileId) {
      return res.status(400).json({
        success: false,
        message: "profileId is required",
      });
    }

    const key = getRazorpayPublicKey();
    if (!key) {
      return res.status(500).json({
        success: false,
        message: "Razorpay is not configured",
      });
    }

    const profileRes = await getProfileDetails(profileId);
    const profilePayload = profileRes?.message || profileRes || {};
    const planName =
      profilePayload?.name ||
      profilePayload?.planName ||
      profilePayload?.profileName ||
      `plan_${profileId}`;

    const amountFromPlan = extractAmount(profilePayload);
    const finalAmount =
      Number.isFinite(amountFromPlan) && amountFromPlan > 0
        ? amountFromPlan
        : fallbackAmount;

    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "Plan amount not found in profile details. Pass amount in body for this plan.",
      });
    }
    const finalAccountId = normalizeText(req.body?.accountId);
    const finalGroupId = normalizeText(req.body?.groupId);

    if (!finalAccountId || !finalGroupId) {
      return res.status(400).json({
        success: false,
        message: "accountId and groupId are required in request body",
      });
    }

    const groupDetailsRes = await getGroupDetails(finalAccountId);
    const groupRows = extractRowsFromGroupDetails(groupDetailsRes);
    const normalizedProfileId = normalizeText(profileId);
    const hasProfileIdInRows = groupRows.some((row) =>
      normalizeText(extractTextByKeys(row, PROFILE_ID_KEYS))
    );

    const hasValidMapping = groupRows.some((row) => {
      const rowGroupId = normalizeText(extractTextByKeys(row, GROUP_ID_KEYS));
      const rowProfileId = normalizeText(extractTextByKeys(row, PROFILE_ID_KEYS));

      if (rowGroupId !== finalGroupId) return false;
      if (!hasProfileIdInRows) return true;
      return rowProfileId === normalizedProfileId;
    });

    if (!hasValidMapping) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid accountId/groupId/profileId combination. Please pass values from franchise group-details.",
      });
    }

    const order = await createRazorpayOrder({
      amount: finalAmount,
      currency: "INR",
      receipt: `plan_${profileId}_${Date.now()}`,
      notes: {
        profileId: String(profileId),
        planName: String(planName),
        groupId: finalGroupId,
        accountId: finalAccountId || "",
      },
    });

    await PaymentHistory.findOneAndUpdate(
      { razorpayOrderId: order.id },
      {
        $set: {
          groupId: finalGroupId,
          accountId: finalAccountId,
          profileId: String(profileId),
          planName: String(planName),
          planAmount: Number(finalAmount),
          currency: order.currency || "INR",
          status: "PENDING",
          planDetails: profilePayload,
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      orderId: order.id,
      key,
      amount: order.amount,
      currency: order.currency,
      plan: {
        profileId,
        groupId: finalGroupId,
        accountId: finalAccountId,
        planName,
        planAmount: finalAmount,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const verifyPlanPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body || {};
    const accountIdFromBody = normalizeText(req.body?.accountId);
    const groupIdFromBody = normalizeText(req.body?.groupId);
    const profileIdFromBody = normalizeText(req.body?.profileId);

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message:
          "razorpay_order_id, razorpay_payment_id and razorpay_signature are required",
      });
    }

    const isValid = verifyRazorpaySignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    const existingPayment = await PaymentHistory.findOne({
      razorpayOrderId: razorpay_order_id,
    })
      .select("accountId groupId profileId")
      .lean();

    const resolvedAccountId =
      normalizeText(existingPayment?.accountId) || accountIdFromBody || null;
    const resolvedGroupId =
      normalizeText(existingPayment?.groupId) || groupIdFromBody || null;
    const resolvedProfileId =
      normalizeText(existingPayment?.profileId) || profileIdFromBody || null;

    const identityPatch = {};
    if (resolvedAccountId) identityPatch.accountId = resolvedAccountId;
    if (resolvedGroupId) identityPatch.groupId = resolvedGroupId;
    if (resolvedProfileId) identityPatch.profileId = resolvedProfileId;

    if (!isValid) {
      await PaymentHistory.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        {
          $set: {
            ...identityPatch,
            status: "FAILED",
            razorpayPaymentId: String(razorpay_payment_id),
            razorpaySignature: String(razorpay_signature),
          },
        }
      );

      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    const updated = await PaymentHistory.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        $set: {
          ...identityPatch,
          status: "SUCCESS",
          razorpayPaymentId: String(razorpay_payment_id),
          razorpaySignature: String(razorpay_signature),
          paidAt: new Date(),
        },
      },
      { new: true }
    );

    const resolveCustomer = updated ? await buildCustomerResolver([updated]) : null;
    const responseData = updated
      ? mapPaymentHistoryDoc(updated, resolveCustomer(updated))
      : null;

    return res.status(200).json({
      success: true,
      status: "success",
      message: "Payment verified successfully",
      data: responseData,
    });
  } catch (error) {
    return next(error);
  }
};

export const getPlanPaymentHistoryByGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const planName = req.query.planName?.trim();
    const status = req.query.status?.trim();
    const date = req.query.date?.trim();
    const fromDate = req.query.fromDate?.trim();
    const toDate = req.query.toDate?.trim();
    const accountIdFromQuery = req.query.accountId?.trim();
    const accountIdFromParams = req.params.accountId?.trim();
    const accountId = accountIdFromQuery || accountIdFromParams || null;
    const profileId = req.query.profileId?.trim();

    const query = {};

    if (groupId) {
      query.groupId = String(groupId).trim();
    }

    if (planName) {
      query.planName = { $regex: planName, $options: "i" };
    }

    if (accountId) {
      const exactAccountId = String(accountId);

      if (groupId) {
        query.accountId = exactAccountId;
      } else {
        const relatedGroupIds = await Customer.distinct("userGroupId", {
          accountId: exactAccountId,
        });

        let relatedGroupIdStrings = relatedGroupIds
          .map((id) => normalizeText(id))
          .filter(Boolean);

        if (!relatedGroupIdStrings.length) {
          try {
            const groupDetails = await getGroupDetails(exactAccountId);
            relatedGroupIdStrings = Array.from(
              extractAllTextByKeys(groupDetails, GROUP_ID_KEYS)
            );
          } catch (_err) {
            // Best-effort fallback: continue with exact accountId match only.
          }
        }

        const uniqueGroupIds = Array.from(new Set(relatedGroupIdStrings));

        query.$or = [{ accountId: exactAccountId }];

        if (uniqueGroupIds.length) {
          query.$or.push({ groupId: { $in: uniqueGroupIds } });
          query.$or.push({ profileId: { $in: uniqueGroupIds } });
        }
      }
    }

    if (profileId) {
      query.profileId = String(profileId);
    }

    if (status) {
      const upperStatus = status.toUpperCase();
      if (["PENDING", "SUCCESS", "FAILED"].includes(upperStatus)) {
        query.status = upperStatus;
      }
    }

    if (date || fromDate || toDate) {
      query.createdAt = {};
      if (date) {
        const start = new Date(date);
        const end = new Date(date);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$gte = start;
        query.createdAt.$lte = end;
      } else {
        if (fromDate) {
          query.createdAt.$gte = new Date(fromDate);
        }
        if (toDate) {
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          query.createdAt.$lte = end;
        }
      }
    }

    const skip = (page - 1) * limit;

    const [items, total, summaryRows] = await Promise.all([
      PaymentHistory.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      PaymentHistory.countDocuments(query),
      PaymentHistory.aggregate([
        { $match: query },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const statusSummary = {
      PENDING: 0,
      SUCCESS: 0,
      FAILED: 0,
    };

    for (const row of summaryRows) {
      if (statusSummary[row._id] !== undefined) {
        statusSummary[row._id] = row.count;
      }
    }

    const resolveCustomer = await buildCustomerResolver(items);

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      filters: {
        groupId: groupId ? String(groupId).trim() : null,
        accountId: accountId || null,
        profileId: profileId || null,
        planName: planName || null,
        status: status || null,
        date: date || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
      },
      summary: statusSummary,
      data: items.map((item) => mapPaymentHistoryDoc(item, resolveCustomer(item))),
    });
  } catch (error) {
    return next(error);
  }
};

export const getSinglePlanPaymentDetails = async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: "paymentId is required",
      });
    }

    const payment = await PaymentHistory.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment details not found",
      });
    }

    const resolveCustomer = await buildCustomerResolver([payment]);

    return res.status(200).json({
      success: true,
      data: mapPaymentHistoryDoc(payment, resolveCustomer(payment)),
    });
  } catch (error) {
    return next(error);
  }
};




