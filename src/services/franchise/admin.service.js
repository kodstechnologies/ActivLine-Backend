import axios from "axios";
import Franchise from "../../models/Franchise/franchise.model.js";
import ApiError from "../../utils/ApiError.js";
import { syncFranchiseData } from "./franchise.service.js";

export const fetchAdminsByFranchise = async (accountId) => {

  let franchise = await Franchise.findOne({ accountId });

  if (!franchise) {
    try {
      await syncFranchiseData();
      franchise = await Franchise.findOne({ accountId });
    } catch (syncErr) {
      console.error("Auto sync franchise failed in admins:", syncErr.message);
    }
  }

  if (!franchise) {
    throw new ApiError(404, `Franchise not found for accountId: "${accountId}".`);
  }

  const username = franchise.accountName;
  const password = franchise.apiKey;

  const basicAuth = Buffer
    .from(`${username}:${password}`)
    .toString("base64");

  const response = await axios.get(
    "https://live.activline.in/api/v1/get_all_admins",
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data;

};