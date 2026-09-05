
import activlineClient from "../../../external/activline/activline.client.js";

export const getTicketsFromActivline = async (formData) => {
  const response = await activlineClient.post(
    "/get_all_tickets",
    formData
  );

  return response.data;
};
