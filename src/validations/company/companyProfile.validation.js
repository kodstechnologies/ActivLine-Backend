import { ApiError } from "../../utils/ApiError.js";

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

export const validateCompanyProfileCreate = (body) => {
  const { companyName, email, address } = body || {};

  if (!companyName || !String(companyName).trim()) {
    throw new ApiError(400, "Company name is required");
  }

  if (!email || !EMAIL_REGEX.test(String(email).trim())) {
    throw new ApiError(400, "Valid email is required");
  }

  if (!address || !String(address).trim()) {
    throw new ApiError(400, "Company address is required");
  }
};

export const validateCompanyProfileUpdate = (body) => {
  const { companyName, email, address } = body || {};

  if (!companyName && !email && !address) {
    throw new ApiError(400, "At least one field is required to update");
  }

  if (email && !EMAIL_REGEX.test(String(email).trim())) {
    throw new ApiError(400, "Valid email is required");
  }
};
