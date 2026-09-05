import dotenv from "dotenv";
dotenv.config();
const SMS_AUTH_KEY = process.env.SMS_AUTH_KEY;
const SMS_SENDERID = process.env.SMS_SENDERID || process.env.SMS_SENDER_ID || "ACTVLN";
const SMS_BASE_URL = process.env.SMS_BASE_URL || "https://smsapi.edumarcsms.com/api/v1/sendsms";

export { SMS_AUTH_KEY, SMS_SENDERID, SMS_BASE_URL };