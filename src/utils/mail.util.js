import nodemailer from "nodemailer";
import ApiError from "./ApiError.js";

const mailHost = process.env.MAIL_HOST;
const mailPort = Number(process.env.MAIL_PORT || 587);
const mailUser = process.env.MAIL_USER;
// Gmail app passwords are often copied with spaces, normalize safely.
const mailPass = (process.env.MAIL_PASS || "").replace(/\s+/g, "");
const mailFromName = process.env.MAIL_FROM_NAME || "ActivLine Support";
const useSecure =
  String(process.env.MAIL_SECURE || "").toLowerCase() === "true"
    ? true
    : mailPort === 465;

if (!mailHost || !mailPort || !mailUser || !mailPass) {
  console.error(
    "❌ Mail config missing. Required: MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS"
  );
}

const transporter = nodemailer.createTransport({
  host: mailHost,
  port: mailPort,
  secure: useSecure,
  auth: {
    user: mailUser,
    pass: mailPass,
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
      from: `"${mailFromName}" <${mailUser}>`,
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
      from: `"${mailFromName}" <${mailUser}>`,
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

/**
 * Send admin staff account created email
 */
export const sendAdminStaffCreatedEmail = async ({
  to,
  name,
  email,
  password,
  role,
  status,
}) => {
  try {
    await transporter.sendMail({
      from: `"${mailFromName}" <${mailUser}>`,
      to,
      subject: "Your ActivLine staff account is created",
      html: `
        <div style="font-family: Arial; padding: 12px">
          <h2>Welcome to ActivLine</h2>
          <p>Your staff account has been created successfully.</p>
          <p><b>Name:</b> ${name || "-"}</p>
          <p><b>Email:</b> ${email || to}</p>
          <p><b>Role:</b> ${role || "-"}</p>
          <p><b>Status:</b> ${status || "ACTIVE"}</p>
          <p><b>Password:</b> ${password || "-"}</p>
          <p>Please keep these credentials safe.</p>
          <br/>
          <small>- ActivLine Support</small>
        </div>
      `,
    });
  } catch (error) {
    console.error("Mail send failed:", error.message);
    throw new ApiError(500, "Failed to send staff account email");
  }
};

/**
 * Send admin staff profile updated email
 */
export const sendAdminStaffProfileUpdatedEmail = async ({
  to,
  name,
  email,
  role,
  status,
  updatedFields = [],
}) => {
  try {
    const fields =
      Array.isArray(updatedFields) && updatedFields.length
        ? updatedFields.join(", ")
        : "Profile details";

    await transporter.sendMail({
      from: `"${mailFromName}" <${mailUser}>`,
      to,
      subject: "Your ActivLine staff profile was updated",
      html: `
        <div style="font-family: Arial; padding: 12px">
          <h2>Profile Updated</h2>
          <p>Your staff profile has been updated.</p>
          <p><b>Updated fields:</b> ${fields}</p>
          <p><b>Name:</b> ${name || "-"}</p>
          <p><b>Email:</b> ${email || to}</p>
          <p><b>Role:</b> ${role || "-"}</p>
          <p><b>Status:</b> ${status || "-"}</p>
          <br/>
          <small>- ActivLine Support</small>
        </div>
      `,
    });
  } catch (error) {
    console.error("Mail send failed:", error.message);
    throw new ApiError(500, "Failed to send staff update email");
  }
};

/**
 * Send franchise admin account created email
 */
export const sendFranchiseAdminCreatedEmail = async ({
  to,
  name,
  email,
  password,
  role,
  status,
  accountId,
}) => {
  try {
    await transporter.sendMail({
      from: `"${mailFromName}" <${mailUser}>`,
      to,
      subject: "Your ActivLine franchise admin account is created",
      html: `
        <div style="font-family: Arial; padding: 12px">
          <h2>Welcome to ActivLine</h2>
          <p>Your franchise admin account has been created successfully.</p>
          <p><b>Name:</b> ${name || "-"}</p>
          <p><b>Email:</b> ${email || to}</p>
          <p><b>Role:</b> ${role || "FRANCHISE_ADMIN"}</p>
          <p><b>Status:</b> ${status || "ACTIVE"}</p>
          <p><b>Account ID:</b> ${accountId || "-"}</p>
          <p><b>Password:</b> ${password || "-"}</p>
          <p>Please keep these credentials safe.</p>
          <br/>
          <small>- ActivLine Support</small>
        </div>
      `,
    });
  } catch (error) {
    console.error("Mail send failed:", error.message);
    throw new ApiError(500, "Failed to send franchise admin account email");
  }
};

/**
 * Send franchise admin profile updated email
 */
export const sendFranchiseAdminProfileUpdatedEmail = async ({
  to,
  name,
  email,
  role,
  status,
  accountId,
  password,
  updatedFields = [],
}) => {
  try {
    const fields =
      Array.isArray(updatedFields) && updatedFields.length
        ? updatedFields.join(", ")
        : "Profile details";

    const passwordBlock = password
      ? `<p><b>New Password:</b> ${password}</p>`
      : "";

    await transporter.sendMail({
      from: `"${mailFromName}" <${mailUser}>`,
      to,
      subject: "Your ActivLine franchise admin profile was updated",
      html: `
        <div style="font-family: Arial; padding: 12px">
          <h2>Profile Updated</h2>
          <p>Your franchise admin profile has been updated.</p>
          <p><b>Updated fields:</b> ${fields}</p>
          <p><b>Name:</b> ${name || "-"}</p>
          <p><b>Email:</b> ${email || to}</p>
          <p><b>Role:</b> ${role || "FRANCHISE_ADMIN"}</p>
          <p><b>Status:</b> ${status || "-"}</p>
          <p><b>Account ID:</b> ${accountId || "-"}</p>
          ${passwordBlock}
          <br/>
          <small>- ActivLine Support</small>
        </div>
      `,
    });
  } catch (error) {
    console.error("Mail send failed:", error.message);
    throw new ApiError(500, "Failed to send franchise admin update email");
  }
};
