import { LeadModel } from "../../models/Customer/lead.model.js";
import { createLeadRepo } from "../../repositories/Customer/lead.repository.js";
import { notifyAdminsOnLeadCreate } from "../Notification/notification.service.js";

import Customer from "../../models/Customer/customer.model.js";
import ApiError from "../../utils/ApiError.js";

export const createLeadService = async (payload) => {

  // 🔹 1. Validate referral code if provided
  if (payload.leadUserReferralCode) {
    const referrer = await Customer.findOne({
      "referral.code": payload.leadUserReferralCode
    });

    if (!referrer) {
      throw new ApiError(400, "Invalid referral code");
    }
  }

  // 🔹 3. Existing logic (UNCHANGED)
  const lead = new LeadModel(payload);
  const cleanPayload = LeadModel.sanitize(lead);

  let activlineResponse = null;

  try {
    activlineResponse = await createLeadRepo(cleanPayload);
  } catch (err) {
    console.error("Activline lead creation failed:", err.message);
  }

  try {
    await notifyAdminsOnLeadCreate(cleanPayload);
  } catch (error) {
    console.error("Failed to send lead notification:", error.message);
  }

  return {
    submittedData: cleanPayload,
    activlineResponse,
  };
};
