import axios from "axios";
import activlineConfig from "../../config/Jaze_API/Ticket/activline.config.js";
import ApiError from "../../utils/ApiError.js";

const basicAuth = Buffer
  .from(`${activlineConfig.username}:${activlineConfig.password}`)
  .toString("base64");

const activlineClient = axios.create({
  baseURL: activlineConfig.baseURL,
  timeout: activlineConfig.timeout,
  headers: {
    Authorization: `Basic ${basicAuth}`,
    Accept: "application/json",
  },
});

activlineClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const statusCode = error?.response?.status || 500;
    const message =
      error?.response?.data?.message ||
      error?.message ||
      "Activline API error";
    const meta = error?.response?.data || null;
    throw new ApiError(statusCode, message, meta);
  }
);

export default activlineClient;
