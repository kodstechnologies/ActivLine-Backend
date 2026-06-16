import axios from "axios";
export const sendMessage = async ({ mobile, message, template_id }) => {
  try {
    console.log(
      "Sending message to:",
      mobile,
      "with template ID:",
      template_id,
    );
    const sender_id = process.env.SMS_SENDER_ID;
    const username = process.env.SMS_USERNAME;
    const password = process.env.SMS_PASSWORD;
    const smsApiUrl = `https://www.smsjust.com/blank/sms/user/urlsms.php?username=${username}&pass=${password}&senderid=${sender_id}&dest_mobileno=${mobile}&message=${encodeURIComponent(message)}&dlttempid=${template_id}&response=Y`;
    const response = await axios.post(smsApiUrl);

    console.log("sms response", response?.data);
  } catch (error) {
    console.log(error.response?.data || error.message);
  }
};
