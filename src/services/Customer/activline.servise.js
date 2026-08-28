// services/activline.service.js
import axios from "axios";
import activlineConfig from "../../config/Jaze_API/Ticket/activline.config.js";

const activlineClient = axios.create({
  baseURL: activlineConfig.baseURL,
  timeout: activlineConfig.timeout,
  auth: {
    username: activlineConfig.username,
    password: activlineConfig.password,
  },
});

export const getUsersFromActivline = async (page, perPage) => {
  const response = await activlineClient.get(
    `/get_users/${page}/${perPage}`
  );

  return response.data;
};

export const getProfileDetailsFromActivline = async (profileId) => {
  const response = await activlineClient.get(
    `/get_profile_details/${profileId}`
  );

  return response.data;
};

/**
 * Fetch logoff-time / online status for a Jaze user.
 *
 * Per-franchise credentials are used:
 *   username  →  franchise.accountId   (from GET /api/v1/get_account_details)
 *   password  →  franchise.apiKey      (from GET /api/v1/get_account_details)
 *
 * @param {string} userId      – Jaze/Activline user ID
 * @param {string} accountId   – Franchise accountId  (used as Basic-Auth username)
 * @param {string} apiKey      – Franchise apiKey     (used as Basic-Auth password)
 */
export const getLogoffTimeOnlineStatusFromActivline = async (
  userId,
  accountId,
  apiKey
) => {
  // Build a one-off axios instance with the franchise's own credentials
  const franchiseClient = axios.create({
    baseURL: activlineConfig.baseURL,
    timeout: activlineConfig.timeout,
    auth: {
      username: accountId,
      password: apiKey,
    },
  });

  const response = await franchiseClient.get(
    `/get_logofftime_onlinestatus/${userId}`
  );

  return response.data;
};
