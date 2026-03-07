import axios from "axios";
import Franchise from "../../models/franchise/franchise.model.js";

export const fetchProfilesByFranchise = async (accountId) => {

  // get franchise from DB
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
    "https://live.activline.in/api/v1/get_all_profile_ids",
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
};