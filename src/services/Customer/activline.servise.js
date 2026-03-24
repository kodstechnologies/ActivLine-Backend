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

export const getLogoffTimeOnlineStatusFromActivline = async (userId) => {
  const response = await activlineClient.get(
    `/get_logofftime_onlinestatus/${userId}`
  );

  return response.data;
};
