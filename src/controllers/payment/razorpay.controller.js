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
import { uploadToS3, getS3DownloadUrl } from "../../utils/s3Upload.js";
import puppeteer from "puppeteer";
import { generateInvoiceHTML } from "../../utils/invoiceTemplate.js";

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
    String(k)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ""),
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
        String(propertyName).toLowerCase(),
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
    (row) => String(row?.property || "").toLowerCase() === "period",
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
    String(k)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ""),
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

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
    (row) => String(row?.property || "").toLowerCase() === "description",
  );
  const billingDesc = normalizeText(fromBilling?.value);
  if (billingDesc) return billingDesc;

  const fromProfile = profileRows.find(
    (row) => String(row?.property || "").toLowerCase() === "package type",
  );
  const profileVal = normalizeText(fromProfile?.value);
  if (profileVal) return profileVal;

  return fallback;
};

const resolvePlanName = (paymentObj) => {
  const raw = normalizeText(paymentObj?.planName);
  const fallback = raw;
  const candidate = resolvePlanNameFromDetails(
    paymentObj?.planDetails,
    fallback,
  );

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
      expirationDate: null,
    };
  }

  const fullName =
    `${customer.firstName || ""} ${customer.lastName || ""}`.trim();

  return {
    customerId: customer._id || null,
    userName: customer.userName || null,
    accountId: customer.accountId || null,
    groupId: customer.userGroupId || null,
    name: customer.userName || fullName || null,
    phoneNumber: customer.phoneNumber || null,
    email: customer.emailId || null,
    expirationDate: customer.expirationDate || null,
  };
};

const toPaidBySnapshot = (customer) => {
  if (!customer) return null;

  const fullName =
    `${customer.firstName || ""} ${customer.lastName || ""}`.trim();

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

  if (normalizedProfileId) {
    const found = await Customer.findOne({
      activlineUserId: normalizedProfileId,
    })
      .select(
        "userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId expirationDate",
      )
      .sort({ updatedAt: -1 })
      .lean();
    if (found) return found;
  }

  if (normalizedAccountId) {
    const found = await Customer.findOne({ accountId: normalizedAccountId })
      .select(
        "userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId expirationDate",
      )
      .sort({ updatedAt: -1 })
      .lean();
    if (found) return found;
  }

  const numericGroupId = Number(normalizedGroupId);
  if (Number.isFinite(numericGroupId)) {
    const found = await Customer.findOne({ userGroupId: numericGroupId })
      .select(
        "userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId expirationDate",
      )
      .sort({ updatedAt: -1 })
      .lean();
    if (found) return found;
  }

  if (normalizedGroupId) {
    const found = await Customer.findOne({ userGroupId: normalizedGroupId })
      .select(
        "userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId expirationDate",
      )
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
    [paymentObj.accountId, paymentObj.groupId, paymentObj.profileId].forEach(
      (v) => {
        const key = normalizeText(v);
        if (key) keySet.add(key);
      },
    );
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
    .select(
      "userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId expirationDate",
    )
    .sort({ updatedAt: -1 })
    .lean();

  const byAccountId = new Map();
  const byGroupId = new Map();
  const byActivlineUserId = new Map();

  for (const customer of customers) {
    const accountKey = normalizeText(customer.accountId);
    const groupKey = normalizeText(customer.userGroupId);
    const activlineKey = normalizeText(customer.activlineUserId);

    if (accountKey && !byAccountId.has(accountKey))
      byAccountId.set(accountKey, customer);
    if (groupKey && !byGroupId.has(groupKey)) byGroupId.set(groupKey, customer);
    if (activlineKey && !byActivlineUserId.has(activlineKey))
      byActivlineUserId.set(activlineKey, customer);
  }

  return (paymentDoc) => {
    const payment = paymentDoc.toObject();
    const accountId = normalizeText(payment.accountId);
    const groupId = normalizeText(payment.groupId);
    const profileId = normalizeText(payment.profileId);

    const customer =
      (profileId && byActivlineUserId.get(profileId)) ||
      (groupId && byGroupId.get(groupId)) ||
      (accountId && byAccountId.get(accountId)) ||
      (groupId && byActivlineUserId.get(groupId)) ||
      (groupId && byAccountId.get(groupId)) ||
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

  const planStartDate = obj.planDetails?.calculatedStartDate
    ? new Date(obj.planDetails.calculatedStartDate)
    : baseDate
      ? new Date(baseDate)
      : null;

  // Use planStartDate (not baseDate/paidAt) so that the fallback end-date
  // always equals "plan start + plan period", never "payment date + plan period".
  // Without this, if calculatedEndDate is missing, planEndDate could equal
  // the recharge/payment date when periodDays is falsy/undefined.
  const planEndDate = obj.planDetails?.calculatedEndDate
    ? new Date(obj.planDetails.calculatedEndDate)
    : planStartDate && periodDays
      ? new Date(
          planStartDate.getTime() + Number(periodDays) * 24 * 60 * 60 * 1000,
        )
      : null;

  const userName =
    obj.paidByUserName ||
    paidBy?.userName ||
    resolvedCustomer?.userName ||
    null;

  const phoneNumber =
    obj.paidByPhone ||
    paidBy?.phoneNumber ||
    resolvedCustomer?.phoneNumber ||
    null;

  return {
    paymentId: String(doc._id),
    orderId: obj.razorpayOrderId,
    razorpayPaymentId: obj.razorpayPaymentId,
    status: obj.status,
    isPaid: obj.status === "SUCCESS",
    amount: obj.planAmount,
    platformFee: obj.platformFee !== undefined ? obj.platformFee : 0,
    currency: obj.currency,
    groupId: obj.groupId,
    accountId: resolvedAccountId,
    profileId: obj.profileId,
    planName: resolvedPlanName,
    planPeriodDays: periodDays,
    planStartDate: planStartDate ? planStartDate.toISOString() : null,
    planEndDate: planEndDate ? planEndDate.toISOString() : null,
    paidAt: obj.paidAt,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    userName,
    phoneNumber,
    customer: resolvedCustomer,
    paidBy,
    plan: {
      profileId: obj.profileId,
      planName: resolvedPlanName,
      planAmount: obj.planAmount,
      planPeriodDays: periodDays,
      planStartDate: planStartDate ? planStartDate.toISOString() : null,
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

  const payment = paymentDoc?.toObject
    ? paymentDoc.toObject()
    : paymentDoc || {};
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
    const fallbackAmount = Number(
      req.body?.amount || req.body?.plan?.planAmount || req.body?.plan?.amount,
    );

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
    const finalAccountId = normalizeText(
      req.body?.accountId ||
        req.body?.customer?.accountId ||
        req.body?.plan?.accountId,
    );
    const finalGroupId = normalizeText(
      req.body?.groupId ||
        req.body?.customer?.groupId ||
        req.body?.plan?.groupId,
    );

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
      normalizeText(extractTextByKeys(row, PROFILE_ID_KEYS)),
    );

    const hasValidMapping = groupRows.some((row) => {
      const rowGroupId = normalizeText(extractTextByKeys(row, GROUP_ID_KEYS));
      const rowProfileId = normalizeText(
        extractTextByKeys(row, PROFILE_ID_KEYS),
      );

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

    const platformFee =
      req.body?.platformFee !== undefined ? Number(req.body.platformFee) : 0;
    const validatedPlatformFee =
      Number.isFinite(platformFee) && platformFee >= 0 ? platformFee : 0;
    const totalChargeAmount = finalAmount + validatedPlatformFee;

    const order = await createRazorpayOrder({
      amount: totalChargeAmount,
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
          planAmount: Number(totalChargeAmount),
          platformFee: validatedPlatformFee,
          currency: order.currency || "INR",
          status: "PENDING",
          planDetails: profilePayload,
        },
      },
      { upsert: true, new: true },
    );

    let paidByPatch = null;
    let customerDoc = null;
    const bodyUserName = normalizeText(
      req.body?.userName ||
        req.body?.username ||
        req.body?.customer?.userName ||
        req.body?.customer?.username,
    );
    // Extract phone number from top-level or customer object
    const bodyPhone = normalizeText(
      req.body?.phoneNumber ||
        req.body?.phone ||
        req.body?.customer?.phoneNumber ||
        req.body?.customer?.phone,
    );

    if (bodyUserName) {
      // First try to find existing customer by username in local DB
      const targetCustomer = await Customer.findOne({
        userName: { $regex: `^${escapeRegex(bodyUserName)}$`, $options: "i" },
      })
        .select(
          "userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId",
        )
        .lean();

      if (targetCustomer) {
        customerDoc = targetCustomer;
        // Always prefer DB phone; supplement with body phone if not stored yet
        paidByPatch = {
          paidByCustomerId: targetCustomer._id || null,
          paidByUserName: targetCustomer.userName || bodyUserName,
          paidByName: targetCustomer.userName || bodyUserName,
          paidByPhone: targetCustomer.phoneNumber || bodyPhone || null,
          paidByEmail: targetCustomer.emailId || null,
        };
      } else {
        // User not in DB yet — save whatever we have from request body (pre-registration)
        paidByPatch = {
          paidByUserName: bodyUserName,
          paidByName: bodyUserName,
          paidByPhone: bodyPhone || null,
        };
      }
    } else if (bodyPhone) {
      // ── FLOW 1: Pre-registration ── Only phone provided, no username yet.
      // Try to find an existing customer by phone number.
      const phoneCustomer = await Customer.findOne({ phoneNumber: bodyPhone })
        .select(
          "userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId",
        )
        .lean();
      if (phoneCustomer) {
        customerDoc = phoneCustomer;
        paidByPatch = {
          paidByCustomerId: phoneCustomer._id || null,
          paidByUserName: phoneCustomer.userName || null,
          paidByName: phoneCustomer.userName || null,
          paidByPhone: bodyPhone,
          paidByEmail: phoneCustomer.emailId || null,
        };
      } else {
        // Completely new user — store phone so history can be found later
        paidByPatch = {
          paidByPhone: bodyPhone,
        };
      }
    } else if (req.user?._id) {
      const authCustomer = await Customer.findById(req.user._id)
        .select(
          "userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId",
        )
        .lean();
      customerDoc = authCustomer || null;
      paidByPatch = toPaidBySnapshot(authCustomer);
    }

    // resolveCustomerForPayment is ONLY used for customerDoc (plan owner, for the response).
    // It must NEVER set paidByPatch — otherwise a random previous customer's username
    // gets stored as the payer when no userName/phoneNumber was passed in the body.
    if (!customerDoc) {
      const resolvedCustomer = await resolveCustomerForPayment(
        finalAccountId,
        finalGroupId,
        profileId,
      );
      // Only store as customerDoc (response context), NOT as paidByPatch
      customerDoc = resolvedCustomer || null;
    }

    // paidByPatch comes from explicit body fields (userName or phoneNumber)
    // or from the authenticated JWT user.
    // If none were supplied, fall back to the resolved customerDoc so the order
    // can still be returned — the paidBy fields can be backfilled on verify.
    if (!paidByPatch && customerDoc) {
      paidByPatch = toPaidBySnapshot(customerDoc);
    }

    // Only update if we actually have something to patch — never write nulls.
    if (paidByPatch) {
      await PaymentHistory.updateOne(
        { razorpayOrderId: order.id },
        { $set: paidByPatch },
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
      customer: {
        customerId: customerDoc?._id || null,
        userName: bodyUserName || null,
        accountId: finalAccountId || null,
        groupId: finalGroupId || null,
        name: bodyUserName || null,
        phoneNumber: bodyPhone || null,
        email: req.body?.email || req.body?.customer?.email || null,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const createPlanOrderFromBody = async (req, res, next) => {
  req.params = {
    ...(req.params || {}),
    profileId: req.body?.profileId || req.body?.plan?.profileId,
  };
  return createPlanOrder(req, res, next);
};

export const verifyPlanPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body || {};
    const accountIdFromBody = normalizeText(req.body?.accountId);
    const groupIdFromBody = normalizeText(req.body?.groupId);
    const profileIdFromBody = normalizeText(req.body?.profileId);
    const bodyUserName = normalizeText(
      req.body?.userName ||
        req.body?.username ||
        req.body?.customer?.userName ||
        req.body?.customer?.username,
    );

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
      .select(
        "accountId groupId profileId paidByCustomerId paidByUserName paidByName paidByPhone paidByEmail",
      )
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
    // Extract phone number from top-level or customer object
    const bodyPhone = normalizeText(
      req.body?.phoneNumber ||
        req.body?.phone ||
        req.body?.customer?.phoneNumber ||
        req.body?.customer?.phone,
    );

    let paidByPatch = null;
    if (bodyUserName) {
      // Try to find existing customer by username in local DB
      const targetCustomer = await Customer.findOne({
        userName: { $regex: `^${escapeRegex(bodyUserName)}$`, $options: "i" },
      })
        .select(
          "userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId expirationDate",
        )
        .lean();

      if (targetCustomer) {
        paidByPatch = {
          paidByCustomerId: targetCustomer._id || null,
          paidByUserName:
            targetCustomer.userName || bodyUserName?.trim() || null,
          paidByName: targetCustomer.userName || bodyUserName?.trim() || null,
          // Always store phone — prefer DB value, supplement with body value
          paidByPhone: targetCustomer.phoneNumber || bodyPhone || null,
          paidByEmail:
            targetCustomer.emailId ||
            req.body?.email ||
            req.body?.customer?.email ||
            null,
        };
      } else {
        // User not in DB yet — save phone from body so history can be found later (pre-registration)
        paidByPatch = {
          paidByUserName: bodyUserName?.trim(),
          paidByName: bodyUserName?.trim(),
          paidByPhone: bodyPhone || null,
          paidByEmail: req.body?.email || req.body?.customer?.email || null,
        };
      }
    } else if (bodyPhone) {
      // ── FLOW 1: Pre-registration ── Only phone provided, no username yet.
      const phoneCustomer = await Customer.findOne({ phoneNumber: bodyPhone })
        .select(
          "userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId expirationDate",
        )
        .lean();
      if (phoneCustomer) {
        paidByPatch = {
          paidByCustomerId: phoneCustomer._id || null,
          paidByUserName: phoneCustomer.userName || null,
          paidByName: phoneCustomer.userName || null,
          paidByPhone: bodyPhone,
          paidByEmail: phoneCustomer.emailId || null,
        };
      } else {
        // Brand-new user — store phone so history is retrievable by phone later
        paidByPatch = {
          paidByPhone: bodyPhone,
          paidByEmail: req.body?.email || req.body?.customer?.email || null,
        };
      }
    } else if (req.user?._id) {
      const authCustomer = await Customer.findById(req.user._id)
        .select(
          "userName firstName lastName phoneNumber emailId accountId userGroupId activlineUserId expirationDate",
        )
        .lean();
      paidByPatch = toPaidBySnapshot(authCustomer);
    }

    // If no identity came from the body/auth, check what was already saved
    // during createPlanOrder — userName/phone were stored then, no need to re-send.
    if (!paidByPatch) {
      const hasStoredIdentity =
        existingPayment?.paidByPhone ||
        existingPayment?.paidByUserName ||
        existingPayment?.paidByCustomerId;

      if (hasStoredIdentity) {
        // Identity was already saved during createPlanOrder — nothing new to write.
        // Set paidByPatch to empty object so the update proceeds without overwriting.
        paidByPatch = {};
      } else {
        // Truly no identity at all — cannot proceed.
        return res.status(400).json({
          success: false,
          message: "userName or phoneNumber is required",
        });
      }
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
        },
      );

      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // Fetch customer's current expirationDate
    let currentExpirationDate = null;
    if (resolvedProfileId) {
      const customerForExp = await Customer.findOne({
        activlineUserId: resolvedProfileId,
      })
        .select("expirationDate")
        .lean();
      currentExpirationDate = customerForExp?.expirationDate || null;
    } else {
      const resolvedCustomer = await resolveCustomerForPayment(
        resolvedAccountId,
        resolvedGroupId,
        resolvedProfileId,
      );
      currentExpirationDate = resolvedCustomer?.expirationDate || null;
    }

    const tempPayment = await PaymentHistory.findOne({
      razorpayOrderId: razorpay_order_id,
    })
      .select("planDetails")
      .lean();
    const periodDays =
      extractPlanPeriodDays(tempPayment?.planDetails || {}) || 30;

    const baseDate = new Date();
    let start = baseDate;
    if (currentExpirationDate) {
      const currentExp = new Date(currentExpirationDate);
      if (
        !Number.isNaN(currentExp.getTime()) &&
        currentExp.getTime() > start.getTime()
      ) {
        start = currentExp;
      }
    }

    const calculatedEndDate =
      start && periodDays
        ? new Date(start.getTime() + Number(periodDays) * 24 * 60 * 60 * 1000)
        : null;

    const formattedStartDate = start
      ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`
      : null;
    const formattedEndDate = calculatedEndDate
      ? `${calculatedEndDate.getFullYear()}-${String(calculatedEndDate.getMonth() + 1).padStart(2, "0")}-${String(calculatedEndDate.getDate()).padStart(2, "0")}`
      : null;

    // ── Build a safe planDetails object ──────────────────────────────────────
    // If createPlanOrder stored an error string (e.g. "Invalid ProfileId")
    // instead of an object, MongoDB's dot-notation $set would throw:
    //   "Cannot create field 'calculatedEndDate' in element {planDetails: <str>}"
    // We coerce planDetails to a plain object before merging calculated dates.
    const existingPlanDetails =
      tempPayment?.planDetails !== null &&
      typeof tempPayment?.planDetails === "object" &&
      !Array.isArray(tempPayment?.planDetails)
        ? tempPayment.planDetails
        : {}; // string / null / array → start fresh

    const mergedPlanDetails = {
      ...existingPlanDetails,
      calculatedStartDate: formattedStartDate,
      calculatedEndDate: formattedEndDate,
    };

    const updated = await PaymentHistory.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        $set: {
          ...identityPatch,
          ...(paidByPatch || {}),
          status: "SUCCESS",
          razorpayPaymentId: String(razorpay_payment_id),
          razorpaySignature: String(razorpay_signature),
          paidAt: baseDate,
          planDetails: mergedPlanDetails, // ← whole object, never dot-notation
        },
      },
      { new: true },
    );

    const resolveCustomer = updated
      ? await buildCustomerResolver([updated])
      : null;
    const responseData = updated
      ? mapPaymentHistoryDoc(updated, resolveCustomer(updated))
      : null;

    if (responseData) {
      responseData.customer = {
        customerId: responseData.customer?.customerId || null,
        userName: bodyUserName || null,
        accountId: resolvedAccountId || null,
        groupId: resolvedGroupId || null,
        name: bodyUserName || null,
        phoneNumber: bodyPhone || null,
        email: req.body?.email || req.body?.customer?.email || null,
      };
    }

    const customerIdToUpdate = resolvedProfileId
      ? null
      : responseData?.customer?.customerId || paidByPatch?.paidByCustomerId;
    if (formattedEndDate) {
      // Store both:
      //   expirationDate  = plan end date (formattedEndDate = start + period)
      //   lastRenewedAt   = recharge date (formattedStartDate = payment date / old expiry)
      // Keeping them separate prevents the UI/reports from ever confusing
      // the two values.
      const renewalPatch = {
        expirationDate: formattedEndDate,
        ...(formattedStartDate ? { lastRenewedAt: formattedStartDate } : {}),
      };
      if (resolvedProfileId) {
        await Customer.findOneAndUpdate(
          { activlineUserId: resolvedProfileId },
          { $set: renewalPatch },
        );
      } else if (customerIdToUpdate) {
        await Customer.findByIdAndUpdate(customerIdToUpdate, {
          $set: renewalPatch,
        });
      }
    }

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
      .select(
        "accountId userGroupId activlineUserId userName firstName lastName phoneNumber emailId",
      )
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

    const [items, total, summaryRows, totalsRow, totalCustomers] =
      await Promise.all([
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
      .select(
        "accountId userGroupId activlineUserId userName firstName lastName phoneNumber emailId",
      )
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
    const phoneNumber = req.query.phoneNumber?.trim();

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
          phoneNumber: phoneNumber || null,
        },
        summary: { PENDING: 0, SUCCESS: 0, FAILED: 0 },
        data: [],
      });
    }

    // Extend ownership query with phone-number matching to capture
    // pre-registration payments (made before the user account was created).
    if (customer.phoneNumber && baseQuery.$or) {
      baseQuery.$or.push({ paidByPhone: customer.phoneNumber });
    }

    const query = { ...baseQuery };

    if (planName) {
      query.planName = { $regex: planName, $options: "i" };
    }

    if (profileId) {
      query.profileId = String(profileId);
    }

    if (phoneNumber) {
      query.paidByPhone = { $regex: escapeRegex(phoneNumber), $options: "i" };
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

    const [items, total, summaryRows, totalsRow, totalCustomers] =
      await Promise.all([
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
        phoneNumber: phoneNumber || null,
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
    const bodyUserName = normalizeText(
      req.body?.userName || req.body?.username,
    );

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
    const phoneNumber = (
      req.query.phoneNumber ||
      req.body?.phoneNumber ||
      req.body?.phone
    )?.trim();

    // Optional customer lookup for response mapping (doesn't control filtering).
    const customer = await Customer.findOne({
      userName: { $regex: `^${escapeRegex(bodyUserName)}$`, $options: "i" },
    })
      .select(
        "_id accountId userGroupId activlineUserId userName firstName lastName phoneNumber emailId",
      )
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
    // Also match payments by customer's phone number to capture
    // pre-registration payments (made before the user account was created).
    if (customer?.phoneNumber) {
      orClauses.push({ paidByPhone: customer.phoneNumber });
    }

    const query = { $or: orClauses };

    if (planName) query.planName = { $regex: planName, $options: "i" };
    if (profileId) query.profileId = String(profileId);
    if (phoneNumber)
      query.paidByPhone = { $regex: escapeRegex(phoneNumber), $options: "i" };

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
        phoneNumber: phoneNumber || customer?.phoneNumber || null,
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
export const getCurrentPlanPaymentHistoryByCustomerUserName = async (
  req,
  res,
  next,
) => {
  try {
    const bodyUserName = normalizeText(
      req.body?.userName || req.body?.username,
    );

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

    // Look up customer to get phone number for pre-registration payment matching.
    const customer = await Customer.findOne({
      userName: { $regex: `^${escapeRegex(bodyUserName)}$`, $options: "i" },
    })
      .select("phoneNumber")
      .lean();

    const orClauses = [
      { paidByUserName: userNameRegex },
      { paidByName: userNameRegex },
    ];
    if (customer?.phoneNumber) {
      orClauses.push({ paidByPhone: customer.phoneNumber });
    }

    const match = {
      status: "SUCCESS",
      $or: orClauses,
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
          phoneNumber:
            req.query.phoneNumber?.trim() || customer?.phoneNumber || null,
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
      .select(
        "accountId userGroupId activlineUserId userName firstName lastName phoneNumber emailId",
      )
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
      .select(
        "accountId userGroupId activlineUserId userName firstName lastName phoneNumber emailId",
      )
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
    const latestPayment = await PaymentHistory.findOne({
      status: "SUCCESS",
      $or: [
        { paidByPhone: { $in: customer.phoneNumber } },
        { paidByEmail: { $in: customer.emailId } },
        { paidByCustomerId: { $in: [customer._id] } },
        { paidByUserName: { $in: [customer.userName] } },
        { paidByUserName: { $in: [customer.userName] } },
      ],
    }).sort({
      createdAt: -1,
    });
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
      .select(
        "accountId userGroupId activlineUserId userName firstName lastName phoneNumber emailId expirationDate",
      )
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

    const htmlContent = generateInvoiceHTML({
      paymentId: paymentData.paymentId,
      date: paymentData.paidAt || paymentData.createdAt,
      planStartDate: paymentData?.planStartDate,
      planEndDate: paymentData?.planEndDate,
      planName: paymentData.planName,
      amount: paymentData.amount,
      customer: paymentData.customer,
      plan: paymentData.plan,
      previousBalance: 0,
      taxRate: 0.09,
    });

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    const pdfUint8Array = await page.pdf({
      width: "595px",
      height: "986px",

      printBackground: true,
      margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
      pageRanges: "1",
    });

    await browser.close();

    // Convert Puppeteer's Uint8Array to a Node.js Buffer for S3 upload
    const pdfBuffer = Buffer.from(pdfUint8Array);

    const uploadResult = await uploadToS3({
      buffer: pdfBuffer,
      mimetype: "application/pdf",
      originalname: filename,
      folder: "activline/invoices",
    });

    const downloadUrl = getS3DownloadUrl(uploadResult.key);

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
              extractAllTextByKeys(groupDetails, GROUP_ID_KEYS),
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

    const [items, total, summaryRows, totalsRow, totalCustomers] =
      await Promise.all([
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

export const getLatestFranchisePaymentHistory = async (req, res, next) => {
  try {
    const accountId = req.user?.accountId
      ? String(req.user.accountId).trim()
      : "";

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

    if (
      isFranchiseAdmin &&
      requestedAccountId &&
      requestedAccountId !== accountId
    ) {
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

    const latestPayment = await PaymentHistory.findOne(query).sort({
      paidAt: -1,
      createdAt: -1,
    });

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
    const mapped = mapPaymentHistoryDoc(
      latestPayment,
      resolveCustomer(latestPayment),
    );
    const doc = latestPayment?.toObject
      ? latestPayment.toObject()
      : latestPayment || {};
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
    const mapped = mapPaymentHistoryDoc(payment, resolveCustomer(payment));

    // Enrich paidBy: if paidByPhone is stored but no customerId linked yet,
    // attempt a live lookup so the payer identity is as complete as possible.
    const payObj = payment.toObject ? payment.toObject() : payment;
    if (payObj.paidByPhone && !payObj.paidByCustomerId) {
      const payerByPhone = await Customer.findOne({
        phoneNumber: payObj.paidByPhone,
      })
        .select("_id userName firstName lastName phoneNumber emailId")
        .lean();
      if (payerByPhone && mapped.paidBy) {
        mapped.paidBy.customerId = String(payerByPhone._id);
        mapped.paidBy.userName =
          mapped.paidBy.userName || payerByPhone.userName || null;
        mapped.paidBy.name =
          mapped.paidBy.name || payerByPhone.userName || null;
        mapped.paidBy.email =
          mapped.paidBy.email || payerByPhone.emailId || null;
      } else if (payerByPhone && !mapped.paidBy) {
        mapped.paidBy = {
          customerId: String(payerByPhone._id),
          userName: payerByPhone.userName || null,
          name: payerByPhone.userName || null,
          phoneNumber: payObj.paidByPhone,
          email: payerByPhone.emailId || null,
        };
      }
      // Keep top-level userName/phoneNumber consistent with paidBy
      if (!mapped.userName && mapped.paidBy?.userName) {
        mapped.userName = mapped.paidBy.userName;
      }
    }

    return res.status(200).json({
      success: true,
      data: mapped,
    });
  } catch (error) {
    return next(error);
  }
};

// ── NEW: Get payment history by phone number (works for both flows) ──────────
// Flow 1 (pre-registration): payment made with phone only → find by paidByPhone
// Flow 2 (post-registration): customer exists → also match by username/customerId
export const getPaymentHistoryByPhone = async (req, res, next) => {
  try {
    const phoneParam = normalizeText(
      req.query.phoneNumber ||
        req.query.phone ||
        req.body?.phoneNumber ||
        req.body?.phone,
    );

    if (!phoneParam) {
      return res.status(400).json({
        success: false,
        message: "phoneNumber is required",
      });
    }

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const planName = req.query.planName?.trim();
    const status = req.query.status?.trim();
    const date = req.query.date?.trim();
    const fromDate = req.query.fromDate?.trim();
    const toDate = req.query.toDate?.trim();

    // Try to find a registered customer with this phone number
    const customer = await Customer.findOne({ phoneNumber: phoneParam })
      .select(
        "_id accountId userGroupId activlineUserId userName firstName lastName phoneNumber emailId",
      )
      .lean();

    // Build $or to catch ALL payments linked to this phone:
    //   1. paidByPhone field (pre-registration & post-registration)
    //   2. paidByCustomerId (if registered customer found)
    //   3. paidByUserName / paidByName (if registered customer found)
    const orClauses = [
      {
        paidByPhone: { $regex: `^${escapeRegex(phoneParam)}$`, $options: "i" },
      },
    ];
    if (customer?._id) {
      orClauses.push({ paidByCustomerId: customer._id });
      if (customer.userName) {
        const unRegex = {
          $regex: `^${escapeRegex(customer.userName)}$`,
          $options: "i",
        };
        orClauses.push({ paidByUserName: unRegex });
        orClauses.push({ paidByName: unRegex });
      }
    }

    const query = { $or: orClauses };

    if (planName) query.planName = { $regex: planName, $options: "i" };
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
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
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
      if (statusSummary[row._id] !== undefined)
        statusSummary[row._id] = row.count;
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
        phoneNumber: phoneParam,
        userName: customer?.userName || null,
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
      },
      data: items.map((item) => {
        const mapped = mapPaymentHistoryDoc(item, resolveCustomer(item));
        const { customer: _c, paidBy: _p, plan: _pl, ...rest } = mapped || {};
        return rest;
      }),
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
            doc.paidByUserName ||
            mapped?.paidBy?.userName ||
            mapped?.customer?.userName ||
            null;
          return { item, mapped, mappedUserName };
        })
        .filter(
          (entry) =>
            String(entry.mappedUserName || "").toLowerCase() ===
            normalizedFilter,
        );

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
        { totalAmount: 0, pendingCount: 0, notPaidCount: 0 },
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

    const [items, total, summaryRows, totalsRow, totalCustomers] =
      await Promise.all([
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

// ============================================================
// ✅ DOWNLOAD PAYMENT HISTORY AS EXCEL
// GET /api/payment/history/download/excel
// Filters: paymentIds, status, accountId, fromDate, toDate, search, groupId, page, limit
// ============================================================
export const downloadPaymentHistoryExcel = async (req, res, next) => {
  try {
    const ExcelJS = (await import("exceljs")).default;

    const {
      paymentIds,
      status,
      accountId,
      groupId,
      fromDate,
      toDate,
      search,
      planName,
      page,
      limit,
    } = req.query;

    // ── Build filter query ──────────────────────────────────
    const query = {};

    // 1. Role-based scoping
    if (req.user?.role === "FRANCHISE_ADMIN") {
      const franchiseAccountId = String(req.user?.accountId || "").trim();
      if (!franchiseAccountId) {
        return res.status(403).json({
          success: false,
          message: "Franchise account ID not found for user",
        });
      }
      query.accountId = franchiseAccountId;
    } else if (accountId) {
      query.accountId = String(accountId).trim();
    }

    // 2. Specific selected IDs filter
    let selectedIdsList = [];
    if (paymentIds) {
      if (Array.isArray(paymentIds)) {
        selectedIdsList = paymentIds.map((id) => String(id).trim()).filter(Boolean);
      } else if (typeof paymentIds === "string") {
        selectedIdsList = paymentIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
      }
    }

    if (selectedIdsList.length > 0) {
      query._id = { $in: selectedIdsList };
    }

    // 3. Status filter
    if (status && ["SUCCESS", "PENDING", "FAILED"].includes(status)) {
      query.status = status;
    }

    // 4. Group & Plan filters
    if (groupId) query.groupId = String(groupId).trim();
    if (planName) query.planName = new RegExp(escapeRegex(planName), "i");

    // 5. Date range filter
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        query.createdAt.$lte = to;
      }
    }

    // 6. Search filter
    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), "i");
      const searchOr = [
        { paidByUserName: searchRegex },
        { paidByName: searchRegex },
        { paidByPhone: searchRegex },
        { razorpayOrderId: searchRegex },
        { razorpayPaymentId: searchRegex },
        { planName: searchRegex },
        { accountId: searchRegex },
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchOr }];
        delete query.$or;
      } else {
        query.$or = searchOr;
      }
    }

    // ── Pagination or Full query ─────────────────────────────
    let dbQuery = PaymentHistory.find(query).sort({ createdAt: -1 });

    const parsedLimit = parseInt(limit, 10);
    const parsedPage = parseInt(page, 10) || 1;

    if (selectedIdsList.length > 0) {
      // Fetch selected records directly
      dbQuery = dbQuery.limit(selectedIdsList.length);
    } else if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      // Limit to specific count / page (e.g. 10 items)
      const skip = (parsedPage - 1) * parsedLimit;
      dbQuery = dbQuery.skip(skip).limit(parsedLimit);
    } else {
      // Default safety cap for full export
      dbQuery = dbQuery.limit(10000);
    }

    const items = await dbQuery.lean();

    // ── Resolve customer info ─────────────────────────────────
    const itemDocs = items.map((item) => ({
      ...item,
      toObject: () => item,
    }));
    const resolveCustomer = await buildCustomerResolver(itemDocs);

    // ── Build Excel workbook ──────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Activline";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Payment History", {
      pageSetup: { fitToPage: true, fitToWidth: 1 },
    });

    // Header style
    const headerFill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A5F" },
    };
    const headerFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    const headerAlignment = { vertical: "middle", horizontal: "center" };
    const borderStyle = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // ── Columns ───────────────────────────────────────────────
    sheet.columns = [
      { header: "No.", key: "no", width: 6 },
      { header: "Payment ID", key: "paymentId", width: 28 },
      { header: "Order ID", key: "orderId", width: 30 },
      { header: "Customer Name", key: "customerName", width: 22 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Plan Name", key: "planName", width: 24 },
      { header: "Amount (INR)", key: "amount", width: 15 },
      { header: "Platform Fee", key: "platformFee", width: 14 },
      { header: "Status", key: "status", width: 12 },
      { header: "Franchise (Account ID)", key: "accountId", width: 24 },
      { header: "Group ID", key: "groupId", width: 14 },
      { header: "Paid At", key: "paidAt", width: 22 },
      { header: "Created At", key: "createdAt", width: 22 },
      { header: "Plan Start Date", key: "planStartDate", width: 18 },
      { header: "Plan End Date", key: "planEndDate", width: 18 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = headerAlignment;
      cell.border = borderStyle;
    });
    headerRow.height = 28;

    // Status colors
    const statusColors = {
      SUCCESS: "FF22C55E", // green
      PENDING: "FFF59E0B", // amber
      FAILED: "FFEF4444",  // red
    };

    // ── Add rows ──────────────────────────────────────────────
    items.forEach((item, index) => {
      const mapped = mapPaymentHistoryDoc(
        { ...item, toObject: () => item },
        resolveCustomer({ ...item, toObject: () => item })
      );

      const customerName =
        item.paidByName ||
        item.paidByUserName ||
        mapped?.customer?.userName ||
        mapped?.customer?.name ||
        "--";

      const phone =
        item.paidByPhone ||
        mapped?.customer?.phoneNumber ||
        "--";

      const formatDate = (val) => {
        if (!val) return "--";
        return new Date(val).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      };

      const row = sheet.addRow({
        no: index + 1,
        paymentId: String(item._id || "--"),
        orderId: item.razorpayOrderId || "--",
        customerName,
        phone,
        planName: mapped?.planName || item.planName || "--",
        amount: Number(item.planAmount || 0),
        platformFee: Number(item.platformFee || 0),
        status: item.status || "--",
        accountId: item.accountId || "--",
        groupId: item.groupId || "--",
        paidAt: formatDate(item.paidAt),
        createdAt: formatDate(item.createdAt),
        planStartDate: mapped?.planStartDate
          ? new Date(mapped.planStartDate).toLocaleDateString("en-IN")
          : "--",
        planEndDate: mapped?.planEndDate
          ? new Date(mapped.planEndDate).toLocaleDateString("en-IN")
          : "--",
      });

      // Alternate row background
      const rowBg = index % 2 === 0 ? "FFFAFAFA" : "FFFFFFFF";
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle", horizontal: "left" };
        cell.border = borderStyle;
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: rowBg },
        };
      });

      // Color status cell
      const statusCell = row.getCell("status");
      const color = statusColors[item.status] || "FF6B7280";
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: color + "33" }, // light tint
      };
      statusCell.font = {
        bold: true,
        color: { argb: color },
      };
      statusCell.alignment = { horizontal: "center", vertical: "middle" };

      row.height = 20;
    });

    // ── Freeze top row ─────────────────────────────────────────
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // ── Auto-filter ────────────────────────────────────────────
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columns.length },
    };

    // ── Summary sheet ──────────────────────────────────────────
    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.columns = [
      { header: "Metric", key: "metric", width: 30 },
      { header: "Value", key: "value", width: 25 },
    ];
    ["A1", "B1"].forEach((ref) => {
      const cell = summarySheet.getCell(ref);
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = headerAlignment;
      cell.border = borderStyle;
    });

    const successItems = items.filter((i) => i.status === "SUCCESS");
    const pendingItems = items.filter((i) => i.status === "PENDING");
    const failedItems = items.filter((i) => i.status === "FAILED");
    const totalRevenue = successItems.reduce(
      (s, i) => s + Number(i.planAmount || 0),
      0
    );

    const exportType =
      selectedIdsList.length > 0
        ? `Selected Items (${items.length} records)`
        : Number.isFinite(parsedLimit) && parsedLimit > 0
        ? `Page ${parsedPage} (${items.length} records)`
        : `All Filtered (${items.length} records)`;

    const summaryRows = [
      ["Export Type", exportType],
      ["Total Records Exported", items.length],
      ["Paid (SUCCESS)", successItems.length],
      ["Pending", pendingItems.length],
      ["Failed", failedItems.length],
      ["Total Revenue (INR)", `₹${totalRevenue.toLocaleString("en-IN")}`],
      ["Filters Applied", ""],
      ["  Status", status || "All"],
      ["  Franchise (accountId)", query.accountId || "All"],
      ["  From Date", fromDate || "--"],
      ["  To Date", toDate || "--"],
      ["  Search", search || "--"],
      ["Downloaded At", new Date().toLocaleString("en-IN")],
    ];

    summaryRows.forEach(([metric, value], i) => {
      const r = summarySheet.addRow({ metric, value });
      r.eachCell((cell) => {
        cell.border = borderStyle;
        cell.alignment = { vertical: "middle" };
        const bg = i % 2 === 0 ? "FFFAFAFA" : "FFFFFFFF";
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      });
      r.height = 20;
    });

    // ── Stream response ───────────────────────────────────────
    const fileName = `payment_history_${Date.now()}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return next(error);
  }
};


