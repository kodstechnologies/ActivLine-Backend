import referalMessage from "../../models/admin/Settings/referalMessage.js";
import Referral from "../../models/Customer/referral.model.js";

/**
 * Find all referral records where the specified user is the referrer,
 * populating the referee details.
 * @param {string} referrerId
 * @returns {Promise<Array>}
 */
export const findReferralsByReferrer = (referrerId) => {
  return Referral.find({ referrer: referrerId })
    .populate("referee", "userName firstName lastName createdAt")
    .lean();
};

// referral message

export const referralMessage = () => {
  return referalMessage.findOne().sort({ createdAt: -1 });
};
