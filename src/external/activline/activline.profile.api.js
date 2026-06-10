import FormData from "form-data";
import activlineClient from "./activline.client.js";

// get all profile ids
export const getAllProfileIds = () => {
  return activlineClient.get("/get_all_profile_ids");
};

// get profile details by id
export const getProfileDetails = (profileId) => {
  return activlineClient.get(`/get_profile_details/${profileId}`);
};

// get user details by username
export const getUserByUsername = (username) => {
  return activlineClient.get(`/get_user_by_username/${username}`);
};

// get profile details by phone number
export const getProfileByPhone = (phone) => {
  // const formData = new FormData();
  // formData.append("phone", phone);

  return activlineClient.post(`/get_user_by_phone/${phone}`);
};
