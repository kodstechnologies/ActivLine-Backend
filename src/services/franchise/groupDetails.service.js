import axios from "axios";
import Franchise from "../../models/Franchise/franchise.model.js";
import activlineConfig from "../../config/Jaze_API/Ticket/activline.config.js";
import ApiError from "../../utils/ApiError.js";
import { syncFranchiseData } from "./franchise.service.js";

export const getGroupDetails = async (accountId) => {
  let franchise = await Franchise.findOne({ accountId });

  if (!franchise) {
    // Attempt auto-syncing franchise data from external API if missing in DB
    try {
      await syncFranchiseData();
      franchise = await Franchise.findOne({ accountId });
    } catch (syncErr) {
      console.error("Auto sync franchise failed:", syncErr.message);
    }
  }

  if (!franchise) {
    throw new ApiError(
      404,
      `Franchise not found for accountId: "${accountId}".`
    );
  }

  const username = franchise.accountName;
  const password = franchise.apiKey;
  const basicAuth = Buffer.from(`${username}:${password}`).toString("base64");

  const response = await axios.get(
    `${activlineConfig.baseURL}/get_group_details`,
    {
      timeout: activlineConfig.timeout,
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
};
