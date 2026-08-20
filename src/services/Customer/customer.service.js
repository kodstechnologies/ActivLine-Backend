import jwt from "jsonwebtoken";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import Session from "../../models/Customer/session.model.js";
import {
  createCustomerRepo,
  findByIdentifier,
  findByMobile,
  updateCustomerRepo,
  findCustomerByActivlineId,
} from "../../repositories/Customer/customer.repository.js";

import { generateReferralCode } from "../../utils/referralCode.js";
import { getProfileByPhone } from "../../external/activline/activline.profile.api.js";
import ApiError from "../../utils/ApiError.js";
import FormData from "form-data";
import fs from "fs";
import activlineClient from "../../external/activline/activline.client.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../../utils/cloudinary.js";
// import { createCustomer } from "../../repositories/Customer/customer.repository.js";
import Customer from "../../models/Customer/customer.model.js";
import Referral from "../../models/Customer/referral.model.js";

const uploadCustomerDocumentsForUpdate = async (files) => {
  const documentUrls = {};
  const fileTypes = [
    "idFile",
    "addressFile",
    "cafFile",
    "reportFile",
    "signFile",
    "profilePicFile",
    "profileImage",
  ];

  // multer-s3 already uploaded each file to S3 — just read file.location
  for (const fileType of fileTypes) {
    if (files?.[fileType]?.[0]?.location) {
      documentUrls[fileType] = files[fileType][0].location;
    }
  }

  if (documentUrls.profileImage && !documentUrls.profilePicFile) {
    documentUrls.profilePicFile = documentUrls.profileImage;
  }
  delete documentUrls.profileImage;

  return documentUrls;
};

export const loginCustomer = async ({ identifier, password }) => {
  const customer = await CustomerRepo.findByIdentifier(identifier);

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  if (!customer.isActive) {
    throw new ApiError(403, "Account is inactive");
  }

  const isMatch = await customer.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, "Invalid credentials");
  }

  const token = jwt.sign(
    {
      _id: customer._id,
      role: customer.role,
      email: customer.email,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "7d" },
  );

  return {
    accessToken: token,
    user: {
      _id: customer._id,
      customerId: customer.customerId,
      fullName: customer.fullName,
      mobile: customer.mobile,
      email: customer.email,
      role: customer.role,
    },
  };
};

export const getMessagesByRoom = async (roomId) => {
  return ChatMessageRepo.getMessagesByRoom(roomId);
};

export const createCustomerService = async (payload, files) => {
  const pickFirst = (...values) => {
    for (const value of values) {
      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      ) {
        return value;
      }
    }
    return undefined;
  };
  const rawPhone =
    payload.phoneNumber !== undefined && payload.phoneNumber !== null
      ? String(payload.phoneNumber).trim()
      : "";
  if (rawPhone) {
    const existingByPhone = await Customer.findOne({
      phoneNumber: rawPhone,
    }).select("_id");
    if (existingByPhone) {
      throw new ApiError(409, "Phone number already exists");
    }
  }

  const rawEmail =
    payload.emailId !== undefined && payload.emailId !== null
      ? String(payload.emailId).trim().toLowerCase()
      : "";
  if (rawEmail) {
    const existingByEmail = await Customer.findOne({
      emailId: rawEmail,
    }).select("_id");
    if (existingByEmail) {
      throw new ApiError(409, "Email already exists");
    }
  }
  const generateRandomUserName = async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const randomNumber = crypto.randomInt(0, 1000000);
      const candidate = `AL-${String(randomNumber).padStart(6, "0")}`;
      const exists = await Customer.exists({ userName: candidate });
      if (!exists) return candidate;
    }
    throw new ApiError(500, "Unable to generate unique username");
  };

  const pickChar = (chars) => chars[crypto.randomInt(0, chars.length)];
  const generateStrongPassword = (firstName, length = 12) => {
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const digits = "0123456789";
    const special = "!@#$%^&*";
    const all = upper + lower + digits + special;

    const safeName = String(firstName || "")
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, 3);
    const namePart = safeName
      ? safeName.charAt(0).toUpperCase() + safeName.slice(1).toLowerCase()
      : "";

    const passwordChars = [
      pickChar(upper),
      pickChar(lower),
      pickChar(digits),
      pickChar(special),
    ];

    for (let i = passwordChars.length; i < length; i += 1) {
      passwordChars.push(pickChar(all));
    }

    for (let i = passwordChars.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(0, i + 1);
      [passwordChars[i], passwordChars[j]] = [
        passwordChars[j],
        passwordChars[i],
      ];
    }

    const randomPart = passwordChars.join("");
    return namePart ? `${namePart}${randomPart}` : randomPart;
  };
  // 🔹 1. Determine Username (Use provided or generate)
  let finalUserName = payload.userName;
  let finalPassword = payload.password;

  if (!finalUserName) {
    finalUserName = await generateRandomUserName();
  }

  if (!finalPassword) {
    finalPassword = generateStrongPassword(payload.firstName);
  }

  const generatedUserName = !payload.userName;
  const generatedPassword = !payload.password;

  const formData = new FormData();

  // Use the determined username for Activline and local DB
  Object.entries({
    ...payload,
    userName: finalUserName,
    password: finalPassword,
  }).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      formData.append(key, value);
    }
  });

  if (files?.idFile?.[0]?.path) {
    formData.append("idFile", fs.createReadStream(files.idFile[0].path));
  } else if (files?.idFile?.[0]?.location) {
    formData.append("idFile", files.idFile[0].location);
  }

  if (files?.addressFile?.[0]?.path) {
    formData.append(
      "addressFile",
      fs.createReadStream(files.addressFile[0].path),
    );
  } else if (files?.addressFile?.[0]?.location) {
    formData.append("addressFile", files.addressFile[0].location);
  }

  // 🔹 2. Create user in Activline
  const activlineData = await activlineClient.post("/add_user", formData, {
    headers: formData.getHeaders(),
  });
  console.log("Activeline customer data", activlineData);
  if (activlineData?.status !== "success") {
    throw new ApiError(
      502,
      activlineData?.message || "Failed to create user in Activline",
    );
  }

  // 🎯 Fetch Jaze profile by phone synchronously to extract their assigned referral code
  let ownReferralCode = null;
  const profileResponse = await getProfileByPhone(payload.phoneNumber);
  console.log(
    "Fetched profile response for referral code extraction:",
    profileResponse?.[0]?.[0]?.UserSetting,
  );
  const profileData = Array.isArray(profileResponse?.data)
    ? profileResponse.data[0]
    : profileResponse?.data || profileResponse;
  console.log(
    "Fetched profile data for referral code extraction:",
    profileData?.[0]?.[0]?.UserSetting,
  );
  ownReferralCode = profileData?.[0]?.[0]?.UserSetting?.referral_code || "";

  // 🔹 3. Validate referral code if user used one
  let referrer = null;
  const referralCodeRaw = payload.referralCode;
  let referralCode =
    referralCodeRaw === undefined || referralCodeRaw === null
      ? ""
      : String(referralCodeRaw).trim();

  // Treat common placeholder strings as empty (frontend sometimes sends these)
  if (referralCode) {
    const lowered = referralCode.toLowerCase();
    if (["null", "undefined", "na", "n/a"].includes(lowered)) {
      referralCode = "";
    }
  }

  if (referralCode) {
    referrer = await Customer.findOne({
      "referral.code": referralCode,
    });

    if (!referrer) {
      throw new ApiError(400, "Invalid referral code");
    }
  }

  // 🔹 4. Save customer
  // ❌ Never store plain password inside rawPayload
  const cleanPayload = { ...payload };
  delete cleanPayload.password;

  const referralData = {};
  if (ownReferralCode) {
    referralData.code = ownReferralCode;
  }
  console.log("Referral data for new customer:", ownReferralCode);
  const savedCustomer = await createCustomerRepo({
    // Customer own refer code
    referral: {
      code:
        ownReferralCode ||
        activlineData?.message?.UserSetting?.referral_code ||
        null,
    },
    /* ===============================   
     🔹 CORE DETAILS
  =============================== */
    userGroupId: payload.userGroupId,
    accountId: payload.accountId,
    userName: finalUserName, // Use determined username
    phoneNumber: payload.phoneNumber,
    emailId: payload.emailId,
    password: finalPassword, // will hash if schema has pre-save hook
    userState: payload.userState,
    userType: payload.userType,
    activationDate: payload.activationDate,
    expirationDate: payload.expirationDate,
    customActivationDate: payload.customActivationDate,
    customExpirationDate: payload.customExpirationDate,

    /* ===============================
     🔹 USER DETAILS
  =============================== */
    firstName: payload.firstName,
    lastName: payload.lastName,
    altPhoneNumber: payload.altPhoneNumber,
    altEmailId: payload.altEmailId,

    /* ===============================
     🔹 CUSTOMER ADDRESS
  =============================== */
    address: {
      line1: payload.address_line1,
      line2: payload.address_line2,
      city: payload.address_city,
      pin: payload.address_pin,
      state: payload.address_state,
      country: payload.address_country,
    },

    /* ===============================
     🔹 INSTALLATION ADDRESS
  =============================== */
    installationAddress: {
      line1: pickFirst(
        payload.installation_address_line1,
        payload["installationAddress-line1"],
        payload.installationAddress_line1,
        payload.installationAddressLine1,
      ),
      line2: pickFirst(
        payload.installation_address_line2,
        payload["installationAddress-line2"],
        payload.installationAddress_line2,
        payload.installationAddressLine2,
      ),
      city: pickFirst(
        payload.installation_address_city,
        payload["installationAddress-city"],
        payload.installationAddress_city,
        payload.installationAddressCity,
      ),
      pin: pickFirst(
        payload.installation_address_pin,
        payload["installationAddress-pin"],
        payload.installationAddress_pin,
        payload.installationAddressPin,
      ),
      state: pickFirst(
        payload.installation_address_state,
        payload["installationAddress-state"],
        payload.installationAddress_state,
        payload.installationAddressState,
      ),
      country: pickFirst(
        payload.installation_address_country,
        payload["installationAddress-country"],
        payload.installationAddress_country,
        payload.installationAddressCountry,
      ),
    },

    /* ===============================
     🔹 BILLING / OVERRIDE
  =============================== */
    overridePriceEnable: payload.overridePriceEnable,
    overrideAmount: payload.overrideAmount,
    overrideAmountBasedOn: payload.overrideAmountBasedOn,
    createBilling: payload.createBilling,

    /* ===============================
     🔹 LOCATION
  =============================== */
    locationDetailsNotImport: payload.location_details_not_import,
    collectionAreaImport: payload.collection_area_import,
    collectionStreetImport: payload.collection_street_import,
    collectionBlockImport: payload.collection_block_import,

    /* ===============================
     🔹 AUTH FLAGS
  =============================== */
    disableUserIpAuth: payload.disableUserIpAuth,
    disableUserMacAuth: payload.disableUserMacAuth,
    disableUserHotspotAuth: payload.disableUserHotspotAuth,

    /* ===============================
     🔹 CAF
  =============================== */
    cafNum: payload.caf_num,

    /* ===============================
     🔹 ACTIVLINE ID
  =============================== */
    activlineUserId: activlineData?.message?.userId?.toString(),

    /* ===============================
     🔹 DOCUMENTS
  =============================== */
    documents: {
      idFile: null,
      addressFile: null,
      cafFile: null,
      reportFile: null,
      signFile: null,
      profilePicFile: null,
    },

    /* ===============================
     🔹 AUDIT
  =============================== */
    rawPayload: cleanPayload,
  });

  // 🔹 5. Record referral in separate schema AFTER customer creation (referredCount will increment upon plan purchase/activation)
  if (referrer) {
    await Referral.create({
      referrer: referrer._id,
      referee: savedCustomer._id,
      codeUsed: referralCode,
      referredAt: new Date(),
      referralCompleted: false,
    });
  }
  // console.log("✅ Created customer:", savedCustomer);
  return {
    customer: savedCustomer,
    credentials: {
      userName: finalUserName,
      password: finalPassword,
    },
    generated: {
      userName: generatedUserName,
      password: generatedPassword,
    },
  };
};

export const finalizeCustomerDocuments = async (activlineUserId, files) => {
  if (!activlineUserId || !files || Object.keys(files).length === 0) {
    return null;
  }

  const documentUrls = await uploadCustomerDocumentsForUpdate(files);
  const updateData = {};

  Object.entries(documentUrls).forEach(([key, value]) => {
    if (value) {
      updateData["documents." + key] = value;
    }
  });

  if (Object.keys(updateData).length === 0) {
    return null;
  }

  return updateCustomerRepo(activlineUserId, updateData);
};

const buildCustomerUpdateData = (payload) => {
  const update = {};

  /* ===============================
   🔹 CORE / BASIC
  =============================== */
  if (payload.userGroupId) update.userGroupId = payload.userGroupId;
  if (payload.accountId) update.accountId = payload.accountId;
  if (payload.userName) update.userName = payload.userName;
  if (payload.phoneNumber) update.phoneNumber = payload.phoneNumber;
  if (payload.emailId) update.emailId = payload.emailId;
  if (payload.password) update.password = payload.password;

  /* ===============================
   🔹 USER DETAILS
  =============================== */
  if (payload.firstName) update.firstName = payload.firstName;
  if (payload.lastName) update.lastName = payload.lastName;
  if (payload.altPhoneNumber) update.altPhoneNumber = payload.altPhoneNumber;
  if (payload.altEmailId) update.altEmailId = payload.altEmailId;

  /* ===============================
   🔹 USER TYPE & STATUS
  =============================== */
  if (payload.userType) update.userType = payload.userType;
  if (payload.userState) update.userState = payload.userState;
  if (payload.activationDate) update.activationDate = payload.activationDate;
  if (payload.expirationDate) update.expirationDate = payload.expirationDate;
  if (payload.customActivationDate)
    update.customActivationDate = payload.customActivationDate;
  if (payload.customExpirationDate)
    update.customExpirationDate = payload.customExpirationDate;

  /* ===============================
   🔹 CUSTOMER ADDRESS
  =============================== */
  if (
    payload.address_line1 ||
    payload.address_line2 ||
    payload.address_city ||
    payload.address_pin ||
    payload.address_state ||
    payload.address_country
  ) {
    update.address = {};

    if (payload.address_line1) update.address.line1 = payload.address_line1;
    if (payload.address_line2) update.address.line2 = payload.address_line2;
    if (payload.address_city) update.address.city = payload.address_city;
    if (payload.address_pin) update.address.pin = payload.address_pin;
    if (payload.address_state) update.address.state = payload.address_state;
    if (payload.address_country)
      update.address.country = payload.address_country;
  }

  /* ===============================
   🔹 INSTALLATION ADDRESS
  =============================== */
  if (
    payload.installation_address_line1 ||
    payload.installation_address_line2 ||
    payload.installation_address_city ||
    payload.installation_address_pin ||
    payload.installation_address_state ||
    payload.installation_address_country
  ) {
    update.installationAddress = {};

    if (payload.installation_address_line1)
      update.installationAddress.line1 = payload.installation_address_line1;

    if (payload.installation_address_line2)
      update.installationAddress.line2 = payload.installation_address_line2;

    if (payload.installation_address_city)
      update.installationAddress.city = payload.installation_address_city;

    if (payload.installation_address_pin)
      update.installationAddress.pin = payload.installation_address_pin;

    if (payload.installation_address_state)
      update.installationAddress.state = payload.installation_address_state;

    if (payload.installation_address_country)
      update.installationAddress.country = payload.installation_address_country;
  }

  /* ===============================
   🔹 LOCATION MAPPING
  =============================== */
  if (payload.location_details_not_import)
    update.locationDetailsNotImport = payload.location_details_not_import;

  if (payload.collection_area_import)
    update.collectionAreaImport = payload.collection_area_import;

  if (payload.collection_street_import)
    update.collectionStreetImport = payload.collection_street_import;

  if (payload.collection_block_import)
    update.collectionBlockImport = payload.collection_block_import;

  /* ===============================
   🔹 BILLING / PRICE OVERRIDE
  =============================== */
  if (payload.overridePriceEnable)
    update.overridePriceEnable = payload.overridePriceEnable;

  if (payload.overrideAmount) update.overrideAmount = payload.overrideAmount;

  if (payload.overrideAmountBasedOn)
    update.overrideAmountBasedOn = payload.overrideAmountBasedOn;

  if (payload.createBilling) update.createBilling = payload.createBilling;

  /* ===============================
   🔹 CAF / DOCUMENT INFO
  =============================== */
  if (payload.caf_num) update.cafNum = payload.caf_num;

  /* ===============================
   🔹 AUTH / SECURITY FLAGS
  =============================== */
  if (payload.disableUserIpAuth)
    update.disableUserIpAuth = payload.disableUserIpAuth;

  if (payload.disableUserMacAuth)
    update.disableUserMacAuth = payload.disableUserMacAuth;

  if (payload.disableUserHotspotAuth)
    update.disableUserHotspotAuth = payload.disableUserHotspotAuth;

  /* ===============================
   🔹 NOTIFICATIONS
  =============================== */
  if (payload.notifyUserSms) update.notifyUserSms = payload.notifyUserSms;

  /* ===============================
   🔹 AUDIT (OPTIONAL BUT GOOD)
  =============================== */
  update.rawPayload = payload;

  return update;
};

export const updateCustomerService = async (
  activlineUserId,
  payload,
  files,
) => {
  // 1️⃣ Call Activline (already works)
  const formData = new FormData();
  formData.append("userId", activlineUserId);

  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      formData.append(key, value);
    }
  });

  if (files?.idFile?.[0]?.path) {
    formData.append("idFile", fs.createReadStream(files.idFile[0].path));
  } else if (files?.idFile?.[0]?.location) {
    formData.append("idFile", files.idFile[0].location);
  }

  await activlineClient.post("/add_user", formData, {
    headers: formData.getHeaders(),
  });

  // 2️⃣ REMOVE EMPTY VALUES (CRITICAL)
  Object.keys(payload).forEach((key) => {
    if (payload[key] === "") delete payload[key];
  });

  // 3️⃣ MAP PAYLOAD → MONGODB SCHEMA (🔥 THIS FIXES DB)
  const updateData = buildCustomerUpdateData(payload);

  console.log("✅ MongoDB updateData:", updateData); // DEBUG

  const documentUrls = await uploadCustomerDocumentsForUpdate(files);
  Object.entries(documentUrls).forEach(([key, value]) => {
    if (value) {
      updateData["documents." + key] = value;
    }
  });

  // 4️⃣ UPDATE MONGODB
  const updatedCustomer = await updateCustomerRepo(activlineUserId, updateData);

  return updatedCustomer;
};

export const loginCustomerService = async ({
  username,
  password,
  deviceId,
  deviceInfo,
}) => {
  // 🔹 1. Authenticate with Activline
  const formData = new FormData();
  formData.append("username", username);
  formData.append("password", password);

  const res = await activlineClient.post("/authenticate_user", formData, {
    headers: formData.getHeaders(),
  });

  const data = res.data;

  // Expected: ["success","655490137614528","activline"]
  if (!Array.isArray(data) || data[0] !== "success") {
    throw new ApiError(401, "Invalid username or password");
  }

  const activlineUserId = data[1].toString();
  const accountId = data[2];

  // 🔹 2. Prepare session
  const sessionId = deviceId || uuidv4();

  const accessToken = jwt.sign(
    { activlineUserId, accountId, role: "CUSTOMER" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "15m" },
  );

  const refreshToken = jwt.sign(
    { activlineUserId, accountId, sessionId },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" },
  );

  // 🔹 3. Store refresh token (per device)
  await Session.create({
    activlineUserId,
    accountId,
    sessionId,
    refreshToken,
    deviceInfo,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return {
    accessToken,
    refreshToken,
    sessionId,
    expiresIn: 900,
  };
};

export const getMyProfileService = async (userId) => {
  const customer = await Customer.findById(userId).lean();

  if (!customer) {
    throw new ApiError(404, "Customer profile not found");
  }

  return {
    _id: customer._id,

    /* ===============================
       🔹 BASIC INFO
    =============================== */
    userGroupId: customer.userGroupId,
    accountId: customer.accountId,
    userName: customer.userName,
    phoneNumber: customer.phoneNumber,
    emailId: customer.emailId,
    userType: customer.userType,

    /* ===============================
       🔹 NAME DETAILS
    =============================== */
    firstName: customer.firstName,
    lastName: customer.lastName,

    /* ===============================
       🔹 PRIMARY ADDRESS
    =============================== */
    address: customer.address
      ? {
          line1: customer.address.line1,
          line2: customer.address.line2,
          city: customer.address.city,
          pin: customer.address.pin,
          state: customer.address.state,
          country: customer.address.country,
        }
      : undefined,

    /* ===============================
       🔹 INSTALLATION ADDRESS
    =============================== */
    installationAddress: customer.installationAddress
      ? {
          line1: customer.installationAddress.line1,
          line2: customer.installationAddress.line2,
          city: customer.installationAddress.city,
          pin: customer.installationAddress.pin,
          state: customer.installationAddress.state,
          country: customer.installationAddress.country,
        }
      : undefined,

    /* ===============================
       🔹 ACTIVLINE
    =============================== */
    activlineUserId: customer.activlineUserId,

    /* ===============================
       🔹 PROFILE IMAGE
    =============================== */
    profilePicFile: customer.documents?.profilePicFile,

    /* ===============================
       🔹 STATUS & REFERRAL
    =============================== */
    status: customer.status,
    referral: customer.referral || {
      code: undefined,
      referredCount: 0,
    },

    /* ===============================
       🔹 CUSTOM DATES
    =============================== */
    customActivationDate: customer.customActivationDate,
    customExpirationDate: customer.customExpirationDate,

    /* ===============================
       🔹 TIMESTAMPS
    =============================== */
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
};

// services/Customer/customer.service.js

export const getProfileImageService = async (userId) => {
  const customer = await Customer.findById(userId).select(
    "documents.profilePicFile",
  );

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  return {
    profilePicFile: customer.documents?.profilePicFile || null,
  };
};

export const updateProfileImageService = async (userId, file) => {
  const customer = await Customer.findById(userId);

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  // multer-s3 already uploaded to S3 — URL is in file.location
  if (!file?.location) {
    throw new ApiError(500, "S3 upload failed");
  }

  // 🔹 Delete old image from S3 (if exists)
  const oldImage = customer.documents?.profilePicFile;
  if (oldImage) {
    await deleteFromCloudinary(oldImage); // deleteFromS3 via shim
  }

  // 🔹 Update DB
  customer.documents.profilePicFile = file.location;
  await customer.save();

  return {
    profilePicFile: file.location,
  };
};

export const deleteProfileImageService = async (userId) => {
  const customer = await Customer.findById(userId);

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  const oldImage = customer.documents?.profilePicFile;

  if (!oldImage) {
    throw new ApiError(400, "No profile image to delete");
  }

  // 🔹 Delete from S3
  await deleteFromCloudinary(oldImage);

  // 🔹 Remove from DB
  customer.documents.profilePicFile = null;
  await customer.save();
};
