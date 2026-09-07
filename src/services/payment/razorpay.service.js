import crypto from "crypto";
import Razorpay from "razorpay";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

let razorpay;

if (keyId && keySecret) {
  razorpay = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
} else {
  // Keep startup non-blocking; controllers will return clear runtime errors.
  console.warn(
    "Razorpay keys are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET. Payment features will be disabled."
  );
}

import ApiError from "../../utils/ApiError.js";

export const createRazorpayOrder = async ({
  amount,
  currency = "INR",
  receipt,
  notes = {},
}) => {
  if (!razorpay) {
    throw new ApiError(500, "Razorpay is not configured. RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing.");
  }
  try {
    return await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency,
      receipt,
      notes,
    });
  } catch (error) {
    const errorMsg =
      error?.error?.description ||
      error?.description ||
      error?.message ||
      "Failed to create Razorpay order";
    const statusCode = error?.statusCode || error?.status || 500;
    console.error("❌ Razorpay order creation failed:", error);
    throw new ApiError(
      statusCode,
      `Razorpay payment gateway error: ${errorMsg}`
    );
  }
};

export const verifyRazorpaySignature = ({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) => {
  if (!keySecret) {
    return false;
  }

  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(body)
    .digest("hex");

  return expectedSignature === razorpay_signature;
};

export const getRazorpayPublicKey = () => keyId;
