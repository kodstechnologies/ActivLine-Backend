import activlineClient from "../activline/activline.client.js";

export const getUserSessionDetails = (userId, fromDate, toDate) => {
  const hasDateRange = Boolean(fromDate) && Boolean(toDate);
  const endpoint = hasDateRange
    ? `/get_usersession_details/${userId}/${fromDate}/${toDate}`
    : `/get_usersession_details/${userId}`;

  return activlineClient.get(endpoint);
};

export const getUserByPhone = (phone) => {
  return activlineClient.get(`/get_user_by_phone/${phone}`);
};
