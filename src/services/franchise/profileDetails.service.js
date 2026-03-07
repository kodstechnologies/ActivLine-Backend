import axios from "axios";
import Franchise from "../../models/Franchise/franchise.model.js";

export const fetchProfileDetails = async (accountId, profileId) => {

  const franchise = await Franchise.findOne({ accountId });

  if (!franchise) {
    throw new Error("Franchise not found");
  }

  const username = franchise.accountName;
  const password = franchise.apiKey;

  const basicAuth = Buffer
    .from(`${username}:${password}`)
    .toString("base64");

  const response = await axios.get(
    `https://live.activline.in/api/v1/get_profile_details/${profileId}`,
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;

};