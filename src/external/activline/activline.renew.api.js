import FormData from "form-data";
import activlineClient from "./activline.client.js";

export const renewPlan = async (payload = {}) => {
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "object") {
      formData.append(key, JSON.stringify(value));
      return;
    }
    formData.append(key, value);
  });

  return activlineClient.post("/renew", formData, {
    headers: formData.getHeaders(),
  });
};
