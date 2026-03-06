import activlineClient from "./activline.client.js";

// get all profile ids
export const getAllProfileIds = () => {
  return activlineClient.get("/get_all_profile_ids");
};

// get profile details by id
export const getProfileDetails = (profileId) => {
  return activlineClient.get(`/get_profile_details/${profileId}`);
};