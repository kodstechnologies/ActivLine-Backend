import Customer from "../../models/Customer/customer.model.js";
import Referral from "../../models/Customer/referral.model.js";

/**
 * @description Processes the referral records when a referred customer completes registration and plan purchase.
 * @param {Object} customer - The referee customer document.
 */
export const handleReferralFlow = async (customer) => {
  if (!customer) {
    return;
  }

  // Find the referral transaction record for this referee
  const referralRecord = await Referral.findOne({ referee: customer._id });
  if (!referralRecord || referralRecord.referralCompleted) {
    return;
  }

  // Check if referee has an active plan (expirationDate is set)
  if (!customer.expirationDate) {
    return; // Friend has registered but not bought/activated a plan yet
  }

  // 1. Lock the referral immediately in separate schema to prevent duplicate tracking
  referralRecord.referralCompleted = true;
  await referralRecord.save();
  console.log(`[REFERRAL] Marked referral completed for referred customer ${customer.userName}`);

  // 2. Retrieve referrer and update their count of successful referrals
  try {
    const referrer = await Customer.findById(referralRecord.referrer);
    if (!referrer) {
      console.warn(`[REFERRAL] Referrer with ID ${referralRecord.referrer} not found`);
      return;
    }

    // Increment referred count in referrer's profile
    if (referrer.referral) {
      referrer.referral.referredCount = (referrer.referral.referredCount || 0) + 1;
    } else {
      referrer.referral = { referredCount: 1 };
    }

    await referrer.save();
    console.log(`[REFERRAL] Recorded referral successfully. Referrer ${referrer.userName} has now successfully referred ${referrer.referral.referredCount} user(s).`);

  } catch (err) {
    console.error(`[REFERRAL] Error updating referral records for ${customer.userName}:`, err.message);
  }
};
