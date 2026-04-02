import {
  createRazorpayOrder,
  getRazorpayPublicKey,
  verifyRazorpaySignature,
} from "../../services/payment/razorpay.service.js";
import { getProfileDetails } from "../../external/activline/activline.profile.api.js";
import { getGroupDetails } from "../../services/franchise/groupDetails.service.js";
import PaymentHistory from "../../models/payment/paymentHistory.model.js";
import Customer from "../../models/Customer/customer.model.js";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { uploadToCloudinary } from "../../utils/cloudinaryUpload.js";
import cloudinary from "../../utils/cloudinary.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const GROUP_ID_KEYS = [
  "groupId",
  "groupID",
  "group_id",
  "Group_id",
  "Group ID",
  "Group Id",
  "userGroupId",
];
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

  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined || raw === null) continue;

    const normalizedKey = String(key)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (!normalizedTargetKeys.includes(normalizedKey)) continue;

    const asString = String(raw).trim();
    if (asString) return asString;
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

const extractPlanPeriodDays = (planDetails = {}) => {
  const billingRows = Array.isArray(planDetails?.["billing Details"])
    ? planDetails["billing Details"]
    : [];

  const periodRow = billingRows.find(
    (row) => String(row?.property || "").toLowerCase() === "period"
  );
  const raw = normalizeText(periodRow?.value);
  if (!raw) return null;

  const match = raw.match(/(\d+)\s*(day|days|month|months|year|years)/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;

  if (unit.startsWith("day")) return amount;
  if (unit.startsWith("month")) return amount * 30;
  if (unit.startsWith("year")) return amount * 365;
  return null;
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

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const resolvePlanNameFromDetails = (planDetails, fallback) => {
  if (!planDetails || typeof planDetails !== "object") return fallback;

  const direct =
    normalizeText(planDetails.name) ||
    normalizeText(planDetails.planName) ||
    normalizeText(planDetails.profileName);
  if (direct) return direct;

  const billingRows = Array.isArray(planDetails["billing Details"])
    ? planDetails["billing Details"]
    : [];
  const profileRows = Array.isArray(planDetails["profile Details"])
    ? planDetails["profile Details"]
    : [];

  const fromBilling = billingRows.find(
    (row) => String(row?.property || "").toLowerCase() === "description"
  );
  const billingDesc = normalizeText(fromBilling?.value);
  if (billingDesc) return billingDesc;

  const fromProfile = profileRows.find(
    (row) => String(row?.property || "").toLowerCase() === "package type"
  );
  const profileVal = normalizeText(fromProfile?.value);
  if (profileVal) return profileVal;

  return fallback;
};

const resolvePlanName = (paymentObj) => {
  const raw = normalizeText(paymentObj?.planName);
  const fallback = raw;
  const candidate = resolvePlanNameFromDetails(paymentObj?.planDetails, fallback);

  if (!raw) return candidate;
  if (!candidate) return raw;
  if (raw.toLowerCase().startsWith("plan_")) return candidate;
  return raw;
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
      customerId: null,
      userName: null,
      accountId: null,
      groupId: null,
      name: null,
      phoneNumber: null,
      email: null,
    };
  }

  const fullName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();

  return {
    customerId: customer._id || null,
    userName: customer.userName || null,
    accountId: customer.accountId || null,
    groupId: customer.userGroupId || null,
    name: customer.userName || fullName || null,
    phoneNumber: customer.phoneNumber || null,
    email: customer.emailId || null,
  };
};

const toPaidBySnapshot = (customer) => {
  if (!customer) return null;

  const fullName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();

  return {
    paidByCustomerId: customer._id || null,
    paidByUserName: customer.userName || null,
    paidByName: customer.userName || fullName || null,
    paidByPhone: customer.phoneNumber || null,
    paidByEmail: customer.emailId || null,
  };
};

const resolveCustomerForPayment = async (accountId, groupId, profileId) => {
  const normalizedAccountId = normalizeText(accountId);
  const normalizedProfileId = normalizeText(profileId);
  const normalizedGroupId = normalizeText(groupId);

  if (normalizedAccountId) {
    const found = await Customer.findOne({ accountId: normalizedAccountId })
      .select("userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId")
      .sort({ updatedAt: -1 })
      .lean();
    if (found) return found;
  }

  if (normalizedProfileId) {
    const found = await Customer.findOne({ activlineUserId: normalizedProfileId })
      .select("userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId")
      .sort({ updatedAt: -1 })
      .lean();
    if (found) return found;
  }

  const numericGroupId = Number(normalizedGroupId);
  if (Number.isFinite(numericGroupId)) {
    const found = await Customer.findOne({ userGroupId: numericGroupId })
      .select("userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId")
      .sort({ updatedAt: -1 })
      .lean();
    if (found) return found;
  }

  if (normalizedGroupId) {
    const found = await Customer.findOne({ userGroupId: normalizedGroupId })
      .select("userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId")
      .sort({ updatedAt: -1 })
      .lean();
    if (found) return found;
  }

  return null;
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
    .sort({ updatedAt: -1 })
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
      (profileId && byActivlineUserId.get(profileId)) ||
      (groupId && byGroupId.get(groupId)) ||
      (groupId && byAccountId.get(groupId)) ||
      (groupId && byActivlineUserId.get(groupId)) ||
      null;

    return toCustomerSnapshot(customer);
  };
};

const mapPaymentHistoryDoc = (doc, customer) => {
  const obj = doc.toObject();
  const billingMeta = getBillingMeta(obj.planDetails || {});
  const periodDays = extractPlanPeriodDays(obj.planDetails || {});
  const resolvedPlanName = resolvePlanName(obj);
  const resolvedAccountId =
    normalizeText(obj.accountId) || normalizeText(customer?.accountId) || null;
  const paidBy =
    obj.paidByCustomerId ||
    obj.paidByUserName ||
    obj.paidByName ||
    obj.paidByPhone ||
    obj.paidByEmail
      ? {
          customerId: obj.paidByCustomerId || null,
          userName: obj.paidByUserName || null,
          name: obj.paidByName || null,
          phoneNumber: obj.paidByPhone || null,
          email: obj.paidByEmail || null,
        }
      : null;
  const resolvedCustomer = {
    ...(customer || toCustomerSnapshot(null)),
    accountId: resolvedAccountId,
  };
  const baseDate = obj.paidAt || obj.createdAt || null;
  const planEndDate =
    baseDate && periodDays
      ? new Date(new Date(baseDate).getTime() + Number(periodDays) * 24 * 60 * 60 * 1000)
      : null;

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
    planName: resolvedPlanName,
    planPeriodDays: periodDays,
    planEndDate: planEndDate ? planEndDate.toISOString() : null,
    paidAt: obj.paidAt,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    customer: resolvedCustomer,
    paidBy,
    plan: {
      profileId: obj.profileId,
      planName: resolvedPlanName,
      planAmount: obj.planAmount,
      planPeriodDays: periodDays,
      planEndDate: planEndDate ? planEndDate.toISOString() : null,
      billingPlanId: billingMeta.billingPlanId,
      totalPrice: billingMeta.totalPrice,
      details: obj.planDetails || {},
    },
  };
};

const buildCustomerIdentitySet = (customer) => {
  const ids = new Set();

  const accountId = normalizeText(customer?.accountId);
  const groupId = normalizeText(customer?.userGroupId);
  const profileId = normalizeText(customer?.activlineUserId);

  if (accountId) ids.add(String(accountId));
  if (groupId) ids.add(String(groupId));
  if (profileId) ids.add(String(profileId));

  return Array.from(ids);
};

const buildCustomerOwnershipQuery = (customer) => {
  const ids = buildCustomerIdentitySet(customer);
  if (!ids.length) return null;

  return {
    $or: [
      { accountId: { $in: ids } },
      { groupId: { $in: ids } },
      { profileId: { $in: ids } },
    ],
  };
};

const isPaymentOwnedByCustomer = (paymentDoc, customer) => {
  const ids = new Set(buildCustomerIdentitySet(customer));
  if (!ids.size) return false;

  const payment = paymentDoc?.toObject ? paymentDoc.toObject() : paymentDoc || {};
  const matchKeys = [
    normalizeText(payment.accountId),
    normalizeText(payment.groupId),
    normalizeText(payment.profileId),
  ].filter(Boolean);

  return matchKeys.some((key) => ids.has(String(key)));
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

    const billingMeta = getBillingMeta(profilePayload);

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

    let paidByPatch = null;
    let customerDoc = null;
    const bodyUserName = normalizeText(req.body?.userName || req.body?.username);
    if (req.user?._id) {
      const authCustomer = await Customer.findById(req.user._id)
        .select("userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId")
        .lean();
      customerDoc = authCustomer || null;
      paidByPatch = toPaidBySnapshot(authCustomer);
    }

    if (!paidByPatch && bodyUserName) {
      paidByPatch = {
        paidByUserName: bodyUserName,
        paidByName: bodyUserName,
      };
    }

    if (!customerDoc) {
      const resolvedCustomer = await resolveCustomerForPayment(
        finalAccountId,
        finalGroupId,
        profileId
      );
      customerDoc = resolvedCustomer || customerDoc;
    }

    if (!paidByPatch && customerDoc) {
      paidByPatch = toPaidBySnapshot(customerDoc);
    }

    if (!paidByPatch) {
      return res.status(400).json({
        success: false,
        message: "userName is required",
      });
    }

    if (paidByPatch) {
      await PaymentHistory.updateOne(
        { razorpayOrderId: order.id },
        { $set: paidByPatch }
      );
    }

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
        billingPlanId: billingMeta.billingPlanId,
        totalPrice: billingMeta.totalPrice,
      },
      customer: toCustomerSnapshot(customerDoc),
    });
  } catch (error) {
    return next(error);
  }
};

export const createPlanOrderFromBody = async (req, res, next) => {
  req.params = { ...(req.params || {}), profileId: req.body?.profileId };
  return createPlanOrder(req, res, next);
};

export const verifyPlanPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body || {};
    const accountIdFromBody = normalizeText(req.body?.accountId);
    const groupIdFromBody = normalizeText(req.body?.groupId);
    const profileIdFromBody = normalizeText(req.body?.profileId);
    const bodyUserName = normalizeText(req.body?.userName || req.body?.username);

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
    let paidByPatch = null;
    if (req.user?._id) {
      const authCustomer = await Customer.findById(req.user._id)
        .select("userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId")
        .lean();
      paidByPatch = toPaidBySnapshot(authCustomer);
    }

    if (!paidByPatch && bodyUserName) {
      paidByPatch = {
        paidByUserName: bodyUserName,
        paidByName: bodyUserName,
      };
    }

    if (!paidByPatch) {
      const resolvedCustomer = await resolveCustomerForPayment(
        resolvedAccountId,
        resolvedGroupId,
        resolvedProfileId
      );
      if (resolvedCustomer) {
        paidByPatch = toPaidBySnapshot(resolvedCustomer);
      }
    }

    if (!paidByPatch) {
      return res.status(400).json({
        success: false,
        message: "userName is required",
      });
    }

    if (!isValid) {
      await PaymentHistory.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        {
          $set: {
            ...identityPatch,
            ...(paidByPatch || {}),
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
          ...(paidByPatch || {}),
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

export const getMyPlanPaymentHistory = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const customer = await Customer.findById(customerId)
      .select("accountId userGroupId activlineUserId userName firstName lastName phoneNumber emailId")
      .lean();

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const planName = req.query.planName?.trim();
    const status = req.query.status?.trim();
    const date = req.query.date?.trim();
    const fromDate = req.query.fromDate?.trim();
    const toDate = req.query.toDate?.trim();
    const profileId = req.query.profileId?.trim();
    const userNameOnly = normalizeText(customer?.userName);
    if (!userNameOnly) {
      return res.status(200).json({
        success: true,
        page,
        limit,
        total: 0,
        totalPages: 0,
        filters: {
          planName: planName || null,
          status: status || null,
          date: date || null,
          fromDate: fromDate || null,
          toDate: toDate || null,
          profileId: profileId || null,
        },
        summary: { PENDING: 0, SUCCESS: 0, FAILED: 0 },
        data: [],
      });
    }

    const safeUserName = escapeRegex(userNameOnly);
    const query = {
      $or: [
        { paidByUserName: { $regex: `^${safeUserName}$`, $options: "i" } },
        { paidByName: { $regex: `^${safeUserName}$`, $options: "i" } },
      ],
    };

    if (planName) {
      query.planName = { $regex: planName, $options: "i" };
    }

    // Do not override profileId from query params for "my" history

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
    // Used for summary counts; `customer` is fetched above and contains `accountId`.
    const accountId = customer?.accountId;

    const [items, total, summaryRows, totalsRow, totalCustomers] = await Promise.all([
      PaymentHistory.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      PaymentHistory.countDocuments(query),
      PaymentHistory.aggregate([
        { $match: query },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      PaymentHistory.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: { $ifNull: ["$planAmount", 0] } },
            pendingCount: {
              $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] },
            },
            notPaidCount: {
              $sum: { $cond: [{ $ne: ["$status", "SUCCESS"] }, 1, 0] },
            },
          },
        },
      ]),
      Customer.countDocuments({}),
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

    const customerSnapshot = toCustomerSnapshot(customer);

    const totals = totalsRow?.[0] || {
      totalAmount: 0,
      pendingCount: 0,
      notPaidCount: 0,
    };

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      filters: {
        planName: planName || null,
        status: status || null,
        date: date || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
        profileId: profileId || null,
        userName: userNameOnly,
      },
      summary: statusSummary,
      data: items.map((item) => {
        const mapped = mapPaymentHistoryDoc(item, customerSnapshot);
        const { customer, paidBy, plan, ...rest } = mapped || {};
        return rest;
      }),
    });
  } catch (error) {
    return next(error);
  }
};

export const getPaymentHistoryByCustomerId = async (req, res, next) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "customerId is required",
      });
    }

    const customer = await Customer.findById(customerId)
      .select("accountId userGroupId activlineUserId userName firstName lastName phoneNumber emailId")
      .lean();

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const planName = req.query.planName?.trim();
    const status = req.query.status?.trim();
    const date = req.query.date?.trim();
    const fromDate = req.query.fromDate?.trim();
    const toDate = req.query.toDate?.trim();
    const profileId = req.query.profileId?.trim();

    const baseQuery = buildCustomerOwnershipQuery(customer);
    if (!baseQuery) {
      return res.status(200).json({
        success: true,
        page,
        limit,
        total: 0,
        totalPages: 0,
        filters: {
          planName: planName || null,
          status: status || null,
          date: date || null,
          fromDate: fromDate || null,
          toDate: toDate || null,
          profileId: profileId || null,
        },
        summary: { PENDING: 0, SUCCESS: 0, FAILED: 0 },
        data: [],
      });
    }

    const query = { ...baseQuery };

    if (planName) {
      query.planName = { $regex: planName, $options: "i" };
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
    const accountId = customer?.accountId;

    const [items, total, summaryRows, totalsRow, totalCustomers] = await Promise.all([
      PaymentHistory.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      PaymentHistory.countDocuments(query),
      PaymentHistory.aggregate([
        { $match: query },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      PaymentHistory.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: { $ifNull: ["$planAmount", 0] } },
            pendingCount: {
              $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] },
            },
            notPaidCount: {
              $sum: { $cond: [{ $ne: ["$status", "SUCCESS"] }, 1, 0] },
            },
          },
        },
      ]),
      accountId ? Customer.countDocuments({ accountId: String(accountId) }) : Customer.countDocuments({}),
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

    const customerSnapshot = toCustomerSnapshot(customer);

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      filters: {
        planName: planName || null,
        status: status || null,
        date: date || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
        profileId: profileId || null,
      },
      summary: statusSummary,
      data: items.map((item) => {
        const mapped = mapPaymentHistoryDoc(item, customerSnapshot);
        const { customer: _c, paidBy: _p, plan: _pl, ...rest } = mapped || {};
        return rest;
      }),
    });
  } catch (error) {
    return next(error);
  }
};

export const getPaymentHistoryByCustomerUserName = async (req, res, next) => {
  try {
    const bodyUserName = normalizeText(req.body?.userName || req.body?.username);

    if (!bodyUserName) {
      return res.status(400).json({
        success: false,
        message: "userName is required",
      });
    }

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const planName = req.query.planName?.trim();
    const status = req.query.status?.trim();
    const date = req.query.date?.trim();
    const fromDate = req.query.fromDate?.trim();
    const toDate = req.query.toDate?.trim();
    const profileId = req.query.profileId?.trim();

    // Optional customer lookup for response mapping (doesn't control filtering).
    const customer = await Customer.findOne({
      userName: { $regex: `^${escapeRegex(bodyUserName)}$`, $options: "i" },
    })
      .select("_id accountId userGroupId activlineUserId userName firstName lastName phoneNumber emailId")
      .lean();

    const userNameRegex = {
      $regex: `^${escapeRegex(bodyUserName)}$`,
      $options: "i",
    };

    // Filter using the same fields that exist in PaymentHistory documents.
    const orClauses = [
      { paidByUserName: userNameRegex },
      { paidByName: userNameRegex },
    ];
    if (customer?._id) {
      orClauses.push({ paidByCustomerId: customer._id });
    }

    const query = { $or: orClauses };

    if (planName) query.planName = { $regex: planName, $options: "i" };
    if (profileId) query.profileId = String(profileId);

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
        if (fromDate) query.createdAt.$gte = new Date(fromDate);
        if (toDate) {
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          query.createdAt.$lte = end;
        }
      }
    }

    const skip = (page - 1) * limit;

    const [items, total, summaryRows, totalsRow] = await Promise.all([
      PaymentHistory.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PaymentHistory.countDocuments(query),
      PaymentHistory.aggregate([
        { $match: query },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      PaymentHistory.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: { $ifNull: ["$planAmount", 0] } },
            pendingCount: {
              $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] },
            },
            notPaidCount: {
              $sum: { $cond: [{ $ne: ["$status", "SUCCESS"] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const statusSummary = { PENDING: 0, SUCCESS: 0, FAILED: 0 };
    for (const row of summaryRows) {
      if (statusSummary[row._id] !== undefined) {
        statusSummary[row._id] = row.count;
      }
    }

    const customerSnapshot = toCustomerSnapshot(customer);

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      filters: {
        planName: planName || null,
        status: status || null,
        date: date || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
        profileId: profileId || null,
        userName: bodyUserName,
      },
      summary: statusSummary,
      data: items.map((item) => {
        const mapped = mapPaymentHistoryDoc(item, customerSnapshot);
        const { customer: _c, paidBy: _p, plan: _pl, ...rest } = mapped || {};
        return {
          ...rest,
          // Helpful for admin verification.
          paidByUserName: mapped?.paidBy?.userName || null,
          paidByName: mapped?.paidBy?.name || null,
        };
      }),
    });
  } catch (error) {
    return next(error);
  }
};

// Returns payment history for the customer's "current plan" (latest SUCCESS purchase)
// by matching PaymentHistory.paidByUserName/paidByName.
export const getCurrentPlanPaymentHistoryByCustomerUserName = async (req, res, next) => {
  try {
    const bodyUserName = normalizeText(req.body?.userName || req.body?.username);

    if (!bodyUserName) {
      return res.status(400).json({
        success: false,
        message: "userName is required",
      });
    }

    const userNameRegex = {
      $regex: `^${escapeRegex(bodyUserName)}$`,
      $options: "i",
    };

    const match = {
      status: "SUCCESS",
      $or: [{ paidByUserName: userNameRegex }, { paidByName: userNameRegex }],
    };

    const latestPayment = await PaymentHistory.findOne(match).sort({
      paidAt: -1,
      createdAt: -1,
    });

    if (!latestPayment) {
      return res.status(200).json({
        success: true,
        data: [],
        summary: { PENDING: 0, SUCCESS: 0, FAILED: 0 },
        page: Math.max(Number(req.query.page) || 1, 1),
        limit: Math.min(Math.max(Number(req.query.limit) || 10, 1), 100),
        total: 0,
        totalPages: 0,
        filters: {
          userName: bodyUserName,
          planName: null,
          status: req.query.status?.trim() || null,
          date: req.query.date?.trim() || null,
          fromDate: req.query.fromDate?.trim() || null,
          toDate: req.query.toDate?.trim() || null,
          profileId: req.query.profileId?.trim() || null,
        },
      });
    }

    // Reuse the existing by-username payment-history endpoint, but lock it to the latest planName.
    req.query = { ...(req.query || {}), planName: latestPayment.planName };
    return getPaymentHistoryByCustomerUserName(req, res, next);
  } catch (error) {
    return next(error);
  }
};

export const getMySinglePlanPaymentDetails = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    const { paymentId } = req.params;

    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: "paymentId is required",
      });
    }

    const customer = await Customer.findById(customerId)
      .select("accountId userGroupId activlineUserId userName firstName lastName phoneNumber emailId")
      .lean();

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const payment = await PaymentHistory.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment details not found",
      });
    }

    if (!isPaymentOwnedByCustomer(payment, customer)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const customerSnapshot = toCustomerSnapshot(customer);

    return res.status(200).json({
      success: true,
      data: mapPaymentHistoryDoc(payment, customerSnapshot),
    });
  } catch (error) {
    return next(error);
  }
};

export const getMyLatestPlanPaymentHistory = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const customer = await Customer.findById(customerId)
      .select("accountId userGroupId activlineUserId userName firstName lastName phoneNumber emailId")
      .lean();

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const baseQuery = buildCustomerOwnershipQuery(customer);
    if (!baseQuery) {
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    const latestPayment = await PaymentHistory.findOne(baseQuery).sort({ createdAt: -1 });

    if (!latestPayment) {
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    const customerSnapshot = toCustomerSnapshot(customer);
    const mapped = mapPaymentHistoryDoc(latestPayment, customerSnapshot);
    const { customer: _c, paidBy: _p, plan: _pl, ...rest } = mapped || {};

    return res.status(200).json({
      success: true,
      data: rest,
    });
  } catch (error) {
    return next(error);
  }
};

export const downloadMyPaymentInvoice = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    const { paymentId } = req.params;

    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: "paymentId is required",
      });
    }

    const customer = await Customer.findById(customerId)
      .select("accountId userGroupId activlineUserId userName firstName lastName phoneNumber emailId")
      .lean();

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const payment = await PaymentHistory.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment details not found",
      });
    }

    if (!isPaymentOwnedByCustomer(payment, customer)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const customerSnapshot = toCustomerSnapshot(customer);
    const paymentData = mapPaymentHistoryDoc(payment, customerSnapshot);

    const formatDate = (value) => {
      if (!value) return "-";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "-";
      return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    };

    const filename = `invoice_${paymentData.paymentId}.pdf`;

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));

    const primary = "#0D3B66";
    const accent = "#FAF0CA";
    const muted = "#6B7280";

    doc.rect(0, 0, doc.page.width, 110).fill(primary);
    doc.fillColor("white").fontSize(24).text("INVOICE", 0, 35, { align: "right" });

    const logoPath = path.join(__dirname, "..", "..", "logo", "activLine_logo.jpg");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 40, 25, { width: 110 });
    }

    doc.fillColor("black");
    const infoTop = 140;

    doc
      .fontSize(11)
      .fillColor(muted)
      .text("Invoice For", 40, infoTop);
    doc
      .fontSize(13)
      .fillColor("black")
      .text(paymentData.customer?.name || "Customer", 40, infoTop + 16);
    doc
      .fontSize(10)
      .fillColor(muted)
      .text(`User Name: ${paymentData.customer?.userName || "-"}`, 40, infoTop + 36);
    doc
      .fontSize(10)
      .fillColor(muted)
      .text(`Account ID: ${paymentData.accountId || "-"}`, 40, infoTop + 52);
    doc
      .fontSize(10)
      .fillColor(muted)
      .text(`Group ID: ${paymentData.groupId || "-"}`, 40, infoTop + 68);
    doc
      .fontSize(10)
      .fillColor(muted)
      .text(`Profile ID: ${paymentData.profileId || "-"}`, 40, infoTop + 84);

    const metaLeft = 340;
    doc
      .fontSize(10)
      .fillColor(muted)
      .text("Invoice Details", metaLeft, infoTop);
    doc
      .fontSize(11)
      .fillColor("black")
      .text(`Payment ID: ${paymentData.paymentId}`, metaLeft, infoTop + 16);
    doc
      .fontSize(10)
      .fillColor(muted)
      .text(`Order ID: ${paymentData.orderId || "-"}`, metaLeft, infoTop + 34);
    doc
      .fontSize(10)
      .fillColor(muted)
      .text(
        `Razorpay Payment ID: ${paymentData.razorpayPaymentId || "-"}`,
        metaLeft,
        infoTop + 50
      );
    doc
      .fontSize(10)
      .fillColor(muted)
      .text(`Created At: ${formatDate(paymentData.createdAt)}`, metaLeft, infoTop + 66);
    doc
      .fontSize(10)
      .fillColor(muted)
      .text(`Paid At: ${formatDate(paymentData.paidAt)}`, metaLeft, infoTop + 82);

    doc.moveTo(40, infoTop + 110).lineTo(555, infoTop + 110).stroke("#E5E7EB");

    const tableTop = infoTop + 130;
    doc
      .rect(40, tableTop, 515, 28)
      .fill(accent)
      .stroke("#E5E7EB");
    doc
      .fillColor(primary)
      .fontSize(11)
      .text("Description", 50, tableTop + 8)
      .text("Qty", 360, tableTop + 8)
      .text("Amount", 430, tableTop + 8);

    doc
      .fillColor("black")
      .fontSize(11)
      .text(paymentData.planName || "Plan", 50, tableTop + 40)
      .text("1", 365, tableTop + 40)
      .text(
        `${paymentData.amount || 0} ${paymentData.currency || "INR"}`,
        430,
        tableTop + 40
      );

    const totalsTop = tableTop + 85;
    doc.rect(360, totalsTop, 195, 80).stroke("#E5E7EB");
    doc
      .fontSize(10)
      .fillColor(muted)
      .text("Subtotal", 370, totalsTop + 12)
      .text("Taxes", 370, totalsTop + 32)
      .text("Total", 370, totalsTop + 52);
    doc
      .fontSize(11)
      .fillColor("black")
      .text(`${paymentData.amount || 0} ${paymentData.currency || "INR"}`, 450, totalsTop + 12)
      .text("0", 450, totalsTop + 32)
      .text(`${paymentData.amount || 0} ${paymentData.currency || "INR"}`, 450, totalsTop + 52);

    doc
      .fontSize(10)
      .fillColor(muted)
      .text(`Status: ${paymentData.status || "-"}`, 40, totalsTop + 15);

    const detailsTop = totalsTop + 110;
    if (paymentData.plan?.details) {
      doc
        .fontSize(12)
        .fillColor(primary)
        .text("Plan Details", 40, detailsTop);
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("black");
      const planDetails = paymentData.plan.details || {};
      const sections = Object.entries(planDetails);
      for (const [sectionName, rows] of sections) {
        doc.fontSize(10).fillColor(primary).text(String(sectionName));
        doc.fontSize(9).fillColor("black");
        if (Array.isArray(rows)) {
          for (const row of rows) {
            const label = row?.property || "";
            const value = row?.value ?? "";
            doc.text(`${label}: ${value}`);
          }
        }
        doc.moveDown(0.4);
      }
    }

    doc
      .fontSize(9)
      .fillColor(muted)
      .text("Thank you for your payment.", 0, doc.page.height - 60, {
        align: "center",
      });
    doc.end();

    const pdfBuffer = await new Promise((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    const uploadResult = await uploadToCloudinary({
      buffer: pdfBuffer,
      mimetype: "application/pdf",
      originalname: filename,
    });

    const downloadUrl = cloudinary.url(uploadResult.public_id, {
      resource_type: uploadResult.resource_type || "raw",
      type: uploadResult.type || "upload",
      flags: "attachment",
      format: uploadResult.format || "pdf",
    });

    return res.status(200).json({
      success: true,
      message: "Invoice uploaded successfully",
      downloadUrl: uploadResult.secure_url,
      
      publicId: uploadResult.public_id,
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

    const [items, total, summaryRows, totalsRow, totalCustomers] = await Promise.all([
      PaymentHistory.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      PaymentHistory.countDocuments(query),
      PaymentHistory.aggregate([
        { $match: query },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      PaymentHistory.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: { $ifNull: ["$planAmount", 0] } },
            pendingCount: {
              $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] },
            },
            notPaidCount: {
              $sum: { $cond: [{ $ne: ["$status", "SUCCESS"] }, 1, 0] },
            },
          },
        },
      ]),
      accountId
        ? Customer.countDocuments({ accountId: String(accountId) })
        : Customer.countDocuments({}),
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
    const totals = totalsRow?.[0] || {
      totalAmount: 0,
      pendingCount: 0,
      notPaidCount: 0,
    };

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
      totals: {
        totalPaymentAmount: totals.totalAmount,
        pendingPaymentCount: totals.pendingCount,
        notPaidPaymentCount: totals.notPaidCount,
        totalCustomerCount: totalCustomers,
      },
      data: items.map((item) => {
        const mapped = mapPaymentHistoryDoc(item, resolveCustomer(item));
        const doc = item?.toObject ? item.toObject() : item || {};
        const userName =
          doc.paidByUserName || mapped?.paidBy?.userName || mapped?.customer?.userName || null;
        const { customer, paidBy, plan, ...rest } = mapped || {};
        return { ...rest, userName };
      }),
    });
  } catch (error) {
    return next(error);
  }
};

export const getLatestFranchisePaymentHistory = async (req, res, next) => {
  try {
    const accountId = req.user?.accountId ? String(req.user.accountId).trim() : "";

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: "Account ID missing for franchise admin",
      });
    }

    const limit = 5;
    const query = { accountId };

    const [items, total, summaryRows] = await Promise.all([
      PaymentHistory.find(query).sort({ createdAt: -1 }).limit(limit),
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
      page: 1,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      filters: {
        accountId,
      },
      summary: statusSummary,
      data: items.map((item) => {
        const mapped = mapPaymentHistoryDoc(item, resolveCustomer(item));
        const doc = item?.toObject ? item.toObject() : item || {};
        const userName =
          doc.paidByUserName ||
          mapped?.paidBy?.userName ||
          mapped?.customer?.userName ||
          null;
        const { customer, paidBy, plan, ...rest } = mapped || {};
        return { ...rest, userName };
      }),
    });
  } catch (error) {
    return next(error);
  }
};

export const getLatestPurchasedPlan = async (req, res, next) => {
  try {
    const requestedAccountId = req.query.accountId?.trim();
    const requestedGroupId = req.query.groupId?.trim();

    const isFranchiseAdmin = req.user?.role === "FRANCHISE_ADMIN";
    const accountId = isFranchiseAdmin
      ? String(req.user?.accountId || "").trim()
      : requestedAccountId || "";

    if (isFranchiseAdmin && requestedAccountId && requestedAccountId !== accountId) {
      return res.status(403).json({
        success: false,
        message: "Access Denied. You can only view your franchise data.",
      });
    }

    if (!accountId && !requestedGroupId) {
      return res.status(400).json({
        success: false,
        message: "accountId or groupId is required",
      });
    }

    const orFilters = [];
    if (accountId) orFilters.push({ accountId: String(accountId) });
    if (requestedGroupId) orFilters.push({ groupId: String(requestedGroupId) });

    const query = {
      status: "SUCCESS",
      ...(orFilters.length === 1 ? orFilters[0] : { $or: orFilters }),
    };

    const latestPayment = await PaymentHistory.findOne(query)
      .sort({ paidAt: -1, createdAt: -1 });

    if (!latestPayment) {
      return res.status(200).json({
        success: true,
        data: null,
        message: "No purchased plan found",
        filters: {
          accountId: accountId || null,
          groupId: requestedGroupId || null,
        },
      });
    }

    const resolveCustomer = await buildCustomerResolver([latestPayment]);
    const mapped = mapPaymentHistoryDoc(latestPayment, resolveCustomer(latestPayment));
    const doc = latestPayment?.toObject ? latestPayment.toObject() : latestPayment || {};
    const userName =
      doc.paidByUserName ||
      mapped?.paidBy?.userName ||
      mapped?.customer?.userName ||
      null;
    const { customer, paidBy, plan, ...rest } = mapped || {};

    return res.status(200).json({
      success: true,
      data: { ...rest, userName },
      filters: {
        accountId: accountId || null,
        groupId: requestedGroupId || null,
      },
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

export const getAllPlanPaymentHistory = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const planName = req.query.planName?.trim();
    const status = req.query.status?.trim();
    const date = req.query.date?.trim();
    const fromDate = req.query.fromDate?.trim();
    const toDate = req.query.toDate?.trim();
    const accountId = req.query.accountId?.trim();
    const franchise = req.query.franchise?.trim();
    const groupId = req.query.groupId?.trim();
    const profileId = req.query.profileId?.trim();
    const userName = req.query.userName?.trim();
    const search = req.query.search?.trim();

    const query = {};
    let resolvedUserName = userName || null;

    const resolvedAccountId = accountId || franchise || null;

    if (resolvedAccountId) {
      query.accountId = String(resolvedAccountId);
    }
    if (groupId) {
      query.groupId = String(groupId);
    }
    if (profileId) {
      query.profileId = String(profileId);
    }
    if (planName) {
      query.planName = { $regex: planName, $options: "i" };
    }

    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { accountId: { $regex: searchRegex } },
        { groupId: { $regex: searchRegex } },
        { profileId: { $regex: searchRegex } },
        { planName: { $regex: searchRegex } },
        { paidByUserName: { $regex: searchRegex } },
        { razorpayOrderId: { $regex: searchRegex } },
        { razorpayPaymentId: { $regex: searchRegex } },
      ];
    }

    if (userName) {
      const customers = await Customer.find({
        userName: { $regex: `^${escapeRegex(userName)}$`, $options: "i" },
      })
        .select("accountId userGroupId activlineUserId userName")
        .lean();

      if (!customers.length) {
        return res.status(200).json({
          success: true,
          page,
          limit,
          total: 0,
          totalPages: 0,
          filters: {
            accountId: resolvedAccountId || null,
            franchise: franchise || null,
            groupId: groupId || null,
            profileId: profileId || null,
            planName: planName || null,
            status: status || null,
            date: date || null,
            fromDate: fromDate || null,
            toDate: toDate || null,
            userName,
            search: search || null,
          },
          summary: { PENDING: 0, SUCCESS: 0, FAILED: 0 },
          data: [],
        });
      }

      const identitySet = new Set();
      for (const customer of customers) {
        const ids = buildCustomerIdentitySet(customer);
        ids.forEach((id) => identitySet.add(String(id)));
      }

      const ids = Array.from(identitySet);
      if (!ids.length) {
        return res.status(200).json({
          success: true,
          page,
          limit,
          total: 0,
          totalPages: 0,
          filters: {
            accountId: resolvedAccountId || null,
            franchise: franchise || null,
            groupId: groupId || null,
            profileId: profileId || null,
            planName: planName || null,
            status: status || null,
            date: date || null,
            fromDate: fromDate || null,
            toDate: toDate || null,
            userName,
            search: search || null,
          },
          summary: { PENDING: 0, SUCCESS: 0, FAILED: 0 },
          data: [],
        });
      }

      resolvedUserName = customers[0]?.userName || userName;
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { accountId: { $in: ids } },
          { groupId: { $in: ids } },
          { profileId: { $in: ids } },
        ],
      });
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

    if (userName) {
      const allItems = await PaymentHistory.find(query).sort({ createdAt: -1 });
      const resolveCustomer = await buildCustomerResolver(allItems);
      const normalizedFilter = String(userName).toLowerCase();

      const mappedItems = allItems
        .map((item) => {
          const mapped = mapPaymentHistoryDoc(item, resolveCustomer(item));
          const doc = item?.toObject ? item.toObject() : item || {};
          const mappedUserName =
            doc.paidByUserName || mapped?.paidBy?.userName || mapped?.customer?.userName || null;
          return { item, mapped, mappedUserName };
        })
        .filter((entry) => String(entry.mappedUserName || "").toLowerCase() === normalizedFilter);

      const statusSummary = { PENDING: 0, SUCCESS: 0, FAILED: 0 };
      for (const entry of mappedItems) {
        const status = entry.mapped?.status;
        if (statusSummary[status] !== undefined) statusSummary[status] += 1;
      }

      const totals = mappedItems.reduce(
        (acc, entry) => {
          const amount = Number(entry.mapped?.amount || 0);
          if (Number.isFinite(amount)) acc.totalAmount += amount;
          if (entry.mapped?.status === "PENDING") acc.pendingCount += 1;
          if (entry.mapped?.status !== "SUCCESS") acc.notPaidCount += 1;
          return acc;
        },
        { totalAmount: 0, pendingCount: 0, notPaidCount: 0 }
      );

      const totalCustomers = await Customer.countDocuments({});

      const total = mappedItems.length;
      const paged = mappedItems.slice(skip, skip + limit);

      return res.status(200).json({
        success: true,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        filters: {
          accountId: resolvedAccountId || null,
          franchise: franchise || null,
          groupId: groupId || null,
          profileId: profileId || null,
          planName: planName || null,
          status: status || null,
          date: date || null,
          fromDate: fromDate || null,
          toDate: toDate || null,
          userName: resolvedUserName || null,
          search: search || null,
        },
        summary: statusSummary,
        totals: {
          totalPaymentAmount: totals.totalAmount,
          pendingPaymentCount: totals.pendingCount,
          notPaidPaymentCount: totals.notPaidCount,
          totalCustomerCount: totalCustomers,
        },
        data: paged.map(({ mapped, mappedUserName }) => {
          const { customer, paidBy, plan, ...rest } = mapped || {};
          return { ...rest, userName: mappedUserName || null };
        }),
      });
    }

    const [items, total, summaryRows, totalsRow, totalCustomers] = await Promise.all([
      PaymentHistory.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      PaymentHistory.countDocuments(query),
      PaymentHistory.aggregate([
        { $match: query },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      PaymentHistory.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: { $ifNull: ["$planAmount", 0] } },
            pendingCount: {
              $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] },
            },
            notPaidCount: {
              $sum: { $cond: [{ $ne: ["$status", "SUCCESS"] }, 1, 0] },
            },
          },
        },
      ]),
      Customer.countDocuments({}),
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
    const totals = totalsRow?.[0] || {
      totalAmount: 0,
      pendingCount: 0,
      notPaidCount: 0,
    };

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      filters: {
        accountId: resolvedAccountId || null,
        franchise: franchise || null,
        groupId: groupId || null,
        profileId: profileId || null,
        planName: planName || null,
        status: status || null,
        date: date || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
        userName: resolvedUserName || null,
        search: search || null,
      },
      summary: statusSummary,
      totals: {
        totalPaymentAmount: totals.totalAmount,
        pendingPaymentCount: totals.pendingCount,
        notPaidPaymentCount: totals.notPaidCount,
        totalCustomerCount: totalCustomers,
      },
      data: items.map((item) => {
        const mapped = mapPaymentHistoryDoc(item, resolveCustomer(item));
        const doc = item?.toObject ? item.toObject() : item || {};
        const userName =
          doc.paidByUserName || mapped?.paidBy?.userName || mapped?.customer?.userName || null;
        const { customer, paidBy, plan, ...rest } = mapped || {};
        return { ...rest, userName };
      }),
    });
  } catch (error) {
    return next(error);
  }
};

