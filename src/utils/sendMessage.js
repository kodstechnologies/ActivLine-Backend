import axios from "axios";
export const sendMessage = async ({ mobile, message, template_id }) => {
  try {
    const response = await axios.post(
      process.env.COMBIRDS_API_URL,
      {
        mobile: mobile,
        message: message,
        sender_id: process.env.COMBIRDS_SENDER_ID,
        template_id: template_id,
      },
      {
        headers: {
          Authorization: process.env.COMBIRDS_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );

    console.log(response.data);
  } catch (error) {
    // console.log(error.response?.data || error.message);
  }
};
