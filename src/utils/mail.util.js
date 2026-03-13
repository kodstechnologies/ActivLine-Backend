import nodemailer from "nodemailer";
import ApiError from "./ApiError.js";

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT),
  secure: false, // TLS (587)
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// ✅ Verify mail server on startup
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Mail server error:", error.message);
  } else {
    console.log("✅ Mail server is ready to send emails");
  }
});

/**
 * Send OTP email
 */
export const sendOTPEmail = async ({ to, otp, purpose = "Profile Update" }) => {
  try {
    await transporter.sendMail({
      from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_USER}>`,
      to,
      subject: `${purpose} OTP Verification`,
      html: `
        <div style="font-family: Arial; padding: 12px">
          <h2>${purpose}</h2>
          <p>Your OTP is:</p>
          <h1 style="color:#2563eb">${otp}</h1>
          <p>This OTP is valid for <b>5 minutes</b>.</p>
          <p>If you didn’t request this, ignore this email.</p>
          <br/>
          <small>– ActivLine Support</small>
        </div>
      `,
    });
  } catch (error) {
    console.error("❌ Mail send failed:", error.message);
    throw new ApiError(500, "Failed to send OTP email");
  }
};

/**
 * Send customer account created email
 */
export const sendCustomerWelcomeEmail = async ({
  to,
  userName,
  password,
  phoneNumber,
  emailId,
}) => {
  try {
    await transporter.sendMail({
      from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_USER}>`,
      to,
      subject: "Your ActivLine account is created",
      html: `
        <div style="font-family: Arial; padding: 12px">
          <h2>Welcome to ActivLine</h2>
          <p>Your account has been created successfully.</p>
          <p><b>Username:</b> ${userName}</p>
          <p><b>Password:</b> ${password}</p>
          <p><b>Phone:</b> ${phoneNumber || "-"}</p>
          <p><b>Email:</b> ${emailId || to}</p>
          <p>Please keep these credentials safe.</p>
          <br/>
          <small>- ActivLine Support</small>
        </div>
      `,
    });
  } catch (error) {
    console.error("Mail send failed:", error.message);
    throw new ApiError(500, "Failed to send account email");
  }
};
