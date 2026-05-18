import mongoose from "mongoose";
import axios from "axios";
import Customer from "../../models/Customer/customer.model.js";
import PaymentHistory from "../../models/payment/paymentHistory.model.js";
import ChatRoom from "../../models/chat/chatRoom.model.js";
import ApiError from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/AsyncHandler.js";
import {
  buildCustomerDetailsHtml,
  renderCustomerDetailsPdf,
} from "../../services/pdf/customerDetailsPdf.service.js";

const MAX_PAYMENTS = 200;
const PAGE_SIZE = 100;
const IMAGE_FETCH_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeText = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

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
  if (unit.startsWith("day")) return amount;
  if (unit.startsWith("month")) return amount * 30;
  if (unit.startsWith("year")) return amount * 365;
  return null;
};

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i;

const isEmbeddableImageUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  const lower = url.toLowerCase();
  if (IMAGE_EXT_RE.test(lower)) return true;
  if (lower.includes("/image/upload/")) return true;
  return false;
};

const fetchImageAsDataUri = async (url) => {
  if (!isEmbeddableImageUrl(url)) return null;

  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: IMAGE_FETCH_TIMEOUT_MS,
      maxContentLength: MAX_IMAGE_BYTES,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const contentType = String(res.headers["content-type"] || "");
    if (!contentType.startsWith("image/")) return null;

    const base64 = Buffer.from(res.data).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
};

const buildDocumentEntries = async (documents = {}) => {
  const entries = [
    ["ID Proof", documents.idFile],
    ["Address Proof", documents.addressFile],
    ["CAF", documents.cafFile],
    ["Report", documents.reportFile],
    ["Signature", documents.signFile],
    ["Profile Photo", documents.profilePicFile],
  ].filter(([, url]) => Boolean(url));

  const results = await Promise.all(
    entries.map(async ([label, url]) => {
      const dataUri = await fetchImageAsDataUri(url);
      return { label, url, dataUri };
    })
  );

  return results;
};

const buildPaymentQuery = (userName, customerId) => {
  const safeUserName = escapeRegex(userName);
  const userNameRegex = { $regex: `^${safeUserName}$`, $options: "i" };
  const orClauses = [
    { paidByUserName: userNameRegex },
    { paidByName: userNameRegex },
  ];
  if (customerId) {
    orClauses.push({ paidByCustomerId: customerId });
  }
  return { $or: orClauses };
};

const mapPaymentRow = (doc) => {
  const baseDate = doc.paidAt || doc.createdAt || null;
  const periodDays = extractPlanPeriodDays(doc.planDetails || {});
  let planEndDate = null;
  if (baseDate && periodDays) {
    planEndDate = new Date(
      new Date(baseDate).getTime() + Number(periodDays) * 24 * 60 * 60 * 1000
    ).toISOString();
  }

  return {
    planName: doc.planName || "—",
    amount: doc.planAmount,
    currency: doc.currency || "INR",
    status: doc.status,
    paidAt: doc.paidAt,
    createdAt: doc.createdAt,
    orderId: doc.razorpayOrderId,
    razorpayPaymentId: doc.razorpayPaymentId,
    profileId: doc.profileId,
    planEndDate,
  };
};

const fetchAllPayments = async (userName, customerId) => {
  const query = buildPaymentQuery(userName, customerId);
  const total = await PaymentHistory.countDocuments(query);
  const cap = Math.min(total, MAX_PAYMENTS);
  const payments = [];

  for (let page = 0; page * PAGE_SIZE < cap; page += 1) {
    const batch = await PaymentHistory.find(query)
      .sort({ paidAt: -1, createdAt: -1 })
      .skip(page * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();

    payments.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return {
    rows: payments.slice(0, MAX_PAYMENTS).map(mapPaymentRow),
    truncated: total > MAX_PAYMENTS,
    total,
  };
};

const resolveCurrentPlan = (payments) => {
  const latest = payments.find((p) => String(p.status).toUpperCase() === "SUCCESS");
  return latest || null;
};
const assertCustomerAccess = async (customer, reqUser) => {
  const role = String(reqUser?.role || "").toUpperCase();

  if (role === "FRANCHISE_ADMIN" && customer.accountId !== reqUser.accountId) {
    throw new ApiError(403, "Access Denied. You can only view customers from your franchise.");
  }

  if (role === "ADMIN_STAFF") {
    const assigned = await ChatRoom.exists({
      assignedStaff: reqUser._id,
      customer: customer._id,
    });
    if (!assigned) {
      throw new ApiError(403, "Access Denied. You can only view customers assigned to you.");
    }
  }
};

export const downloadAdminCustomerDetailsPdf = asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new ApiError(400, "Invalid customerId");
  }

  const customer = await Customer.findById(customerId).lean();
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  await assertCustomerAccess(customer, req.user);

  const userName = customer.userName || customer.username;
  if (!userName) {
    throw new ApiError(400, "Customer userName is required to generate PDF");
  }

  const { rows: payments, truncated, total } = await fetchAllPayments(
    userName,
    customer._id
  );
  const currentPlan = resolveCurrentPlan(payments);
  const documents = await buildDocumentEntries(customer.documents || {});

  const htmlContent = buildCustomerDetailsHtml({
    customer,
    currentPlan,
    payments,
    documents,
    generatedAt: new Date(),
    paymentsTruncated: truncated,
    maxPayments: MAX_PAYMENTS,
  });

  const pdfBuffer = await renderCustomerDetailsPdf(htmlContent);

  const safeName = String(userName).replace(/[^\w.-]+/g, "_");
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `customer_${safeName}_${dateStamp}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  res.setHeader("X-Payment-Total", String(total));
  res.setHeader("X-Payment-Truncated", truncated ? "true" : "false");

  return res.send(pdfBuffer);
});
