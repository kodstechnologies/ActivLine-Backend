import activlineClient from "../../external/activline/activline.client.js";
import FormData from "form-data";
import { findById } from "../../repositories/Customer/customer.repository.js";
import {
  findReferralsByReferrer,
  referralMessage,
} from "../../repositories/Customer/referral.repository.js";

import activlineFormClient from "../../external/activline/activline.client.js";
import Location from "../../models/Customer/customerLocation.mode.js";

/**
 * Get customer profile from database
 */
export const getCustomerProfile = async (userId) => {
  if (!userId) {
    throw new Error("userId is required");
  }

  const customer = await findById(userId);
  if (!customer) {
    throw new Error("Customer not found");
  }

  return customer;
};

/**
 * Get full user details from Activline
 */
export const getActivlineUserDetails = async (userId) => {
  if (!userId) {
    throw new Error("user_id is required");
  }

  const response = await activlineClient.get(`/get_details/${userId}`);

  return response.data;
};

export const editActivlineUserProfile = async (payload) => {
  if (!payload.userId) {
    throw new Error("userId is required");
  }

  const formData = new FormData();

  // Mandatory
  formData.append("userId", payload.userId);

  // Optional fields (append ONLY if present)
  if (payload.userName) formData.append("userName", payload.userName);
  if (payload.password) formData.append("password", payload.password);
  if (payload.firstName) formData.append("firstName", payload.firstName);
  if (payload.lastName) formData.append("lastName", payload.lastName);
  if (payload.emailId) formData.append("emailId", payload.emailId);
  if (payload.phoneNumber) formData.append("phoneNumber", payload.phoneNumber);

  // Address
  if (payload.address_line1)
    formData.append("address_line1", payload.address_line1);
  if (payload.address_line2)
    formData.append("address_line2", payload.address_line2);
  if (payload.address_city)
    formData.append("address_city", payload.address_city);
  if (payload.address_state)
    formData.append("address_state", payload.address_state);
  if (payload.address_pin) formData.append("address_pin", payload.address_pin);

  // Identity
  if (payload.id_proof) formData.append("id_proof", payload.id_proof);
  if (payload.id_pin) formData.append("id_pin", payload.id_pin);

  // Dates
  if (payload.activationDate)
    formData.append("activationDate", payload.activationDate);
  if (payload.expirationDate)
    formData.append("expirationDate", payload.expirationDate);
  if (payload.customActivationDate)
    formData.append("customActivationDate", payload.customActivationDate);
  if (payload.customExpirationDate)
    formData.append("customExpirationDate", payload.customExpirationDate);

  // Send request
  const response = await activlineClient.post("/add_user", formData, {
    headers: formData.getHeaders(),
  });
  return response.data;
};

export const updateUserInActivline = async (payload) => {
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  });

  const response = await activlineFormClient.post("/add_user", formData, {
    headers: formData.getHeaders(),
  });
  return response.data;
};

// update location
export const updateLocationService = async (payload) => {
  const { email, location } = payload;

  return await Location.findOneAndUpdate(
    { email },
    {
      $set: { location },
    },
    {
      new: true,
      upsert: true,
    },
  );
};

/**
 * Get referral summary details for customer
 */
export const getMyReferralsService = async (userId) => {
  const customer = await getCustomerProfile(userId);

  const referralRecords = await findReferralsByReferrer(userId);
  const referralMsg = await referralMessage();
  console.log("Referral Records:", referralMsg);
  const referrals = referralRecords
    .map((r) => {
      if (!r.referee) return null;
      return {
        _id: r.referee._id,
        userName: r.referee.userName,
        firstName: r.referee.firstName,
        lastName: r.referee.lastName,
        createdAt: r.referredAt,
        referralCompleted: r.referralCompleted,
      };
    })
    .filter(Boolean);

  const referralSummary = {
    referralMessage: referralMsg?.message || "Invite friends and earn rewards!",
    code: customer.referral?.code || null,
    totalRegistered: referrals.length,
    totalFreePlansEarned: referrals.filter((r) => r.referralCompleted).length,
    history: referrals.map((r) => ({
      name: `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.userName,
      dateJoined: r.createdAt,
      // status: r.referralCompleted
      //   ? "Earned 1 Month Free"
      //   : "Pending Plan Purchase",
    })),
  };

  return referralSummary;
};
