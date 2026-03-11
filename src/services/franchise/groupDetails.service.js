import axios from "axios";
import Franchise from "../../models/Franchise/franchise.model.js";
import activlineConfig from "../../config/Jaze_API/Ticket/activline.config.js";

export const getGroupDetails = async (accountId) => {
  const franchise = await Franchise.findOne({ accountId });

  if (!franchise) {
    throw new Error("Franchise not found");
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
