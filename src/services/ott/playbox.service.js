import axios from "axios";
import { ApiError } from "../../utils/ApiError.js";

// Global cache for token to avoid hitting /v5/token repeatedly
let cachedPlayboxToken = null;
let tokenExpiry = null;

const PLAYBOX_BASE_URL = process.env.PLAYBOX_API_URL || "https://api.playboxtv.in/v5";

/**
 * Helper to get a valid PlayBoxTV Token
 */
const getValidToken = async () => {
  if (cachedPlayboxToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedPlayboxToken;
  }

  try {
    const payload = {
      iss: process.env.PLAYBOX_ISS || "activline",
      aud: process.env.PLAYBOX_AUD || "playbox",
    };

    const response = await axios.post(`${PLAYBOX_BASE_URL}/token`, payload, {
      headers: {
        "x-api-key": process.env.PLAYBOX_API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (response.data?.status === "success" || response.data?.token) {
      cachedPlayboxToken = response.data.token || response.data.data;
      // Token is valid for 24 hours. Set expiry to 23 hours to be safe.
      tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
      return cachedPlayboxToken;
    }

    throw new ApiError(500, "Failed to retrieve PlayBoxTV token");
  } catch (error) {
    console.error("PlayBoxTV Token Error:", error.response?.data || error.message);
    throw new ApiError(500, "External OTT service authentication failed");
  }
};

/**
 * Create Axios instance for PlayBox API calls with interceptors to inject auth headers
 */
const getPlayboxClient = async () => {
  const token = await getValidToken();
  return axios.create({
    baseURL: PLAYBOX_BASE_URL,
    headers: {
      "Authorization": `Bearer ${token}`,
      "x-api-key": process.env.PLAYBOX_API_KEY,
      "Content-Type": "application/json",
    },
  });
};

/**
 * Check Health Status
 */
export const checkPlayboxHealth = async () => {
  try {
    const response = await axios.get(`${PLAYBOX_BASE_URL}/health`);
    return response.data;
  } catch (error) {
    throw new ApiError(500, "PlayBoxTV health check failed");
  }
};

/**
 * Get Available Packs for Partner
 */
export const getAvailableOttPacks = async () => {
  try {
    const client = await getPlayboxClient();
    const partnerKey = process.env.PLAYBOX_PARTNER_KEY;
    const response = await client.get(`/${partnerKey}/packs`);
    
    if (response.data?.statusCode === 200) {
      return response.data.result;
    }
    throw new ApiError(500, "Failed to fetch available OTT packs");
  } catch (error) {
    throw new ApiError(
      error.response?.status || 500,
      error.response?.data?.message || "Error communicating with OTT provider"
    );
  }
};

/**
 * Assign Pack to Customer
 */
export const assignOttPack = async (customerPhone, customerName, customerEmail, customerId, packCode) => {
  try {
    const client = await getPlayboxClient();
    const partnerKey = process.env.PLAYBOX_PARTNER_KEY;
    
    const payload = {
      phone: customerPhone,
      partnerKey,
      packCode,
      name: customerName,
      email: customerEmail || "",
      customerId: customerId.toString(),
    };

    const response = await client.post(`/assignPack`, payload);
    
    if (response.data?.statusCode === 200) {
      return response.data;
    }
    
    throw new ApiError(500, response.data?.message || "Failed to assign OTT pack");
  } catch (error) {
    throw new ApiError(
      error.response?.status || 500,
      error.response?.data?.message || "Error assigning OTT pack via provider"
    );
  }
};

/**
 * Get Active Packs for Customer
 */
export const getCustomerActivePacks = async (customerPhone) => {
  try {
    const client = await getPlayboxClient();
    const partnerKey = process.env.PLAYBOX_PARTNER_KEY;
    
    const response = await client.get(`/getPack?partnerKey=${partnerKey}&phone=${customerPhone}`);
    
    if (response.data?.statusCode === 200) {
      return response.data.data;
    }
    
    return [];
  } catch (error) {
    throw new ApiError(
      error.response?.status || 500,
      error.response?.data?.message || "Error fetching customer OTT packs"
    );
  }
};

/**
 * Get Partner Balance
 */
export const getOttPartnerBalance = async () => {
  try {
    const client = await getPlayboxClient();
    const partnerKey = process.env.PLAYBOX_PARTNER_KEY;
    
    const response = await client.get(`/${partnerKey}/balance`);
    
    if (response.data?.statusCode === 200) {
      return response.data.balance;
    }
    
    throw new ApiError(500, "Failed to fetch OTT partner balance");
  } catch (error) {
    throw new ApiError(
      error.response?.status || 500,
      error.response?.data?.message || "Error fetching partner balance from OTT provider"
    );
  }
};
