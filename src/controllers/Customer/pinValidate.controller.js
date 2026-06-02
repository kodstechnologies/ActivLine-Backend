import axios from "axios";
import https from "https";
import { asyncHandler } from "../../utils/AsyncHandler.js";
import { ApiResponse } from "../../utils/ApiReponse.js";

import ApiError from "../../utils/ApiError.js";

/**
 * POST /api/location/pin/validate
 */
export const validateAndAutoFillPin = asyncHandler(async (req, res) => {
  const { pin, city, state } = req.body;

  // ✅ PIN format check
  if (!/^\d{6}$/.test(pin)) {
    throw new ApiError(400, "Invalid PIN format. Must be 6 digits.");
  }

  let data;
  try {
    const response = await axios.get(
      `https://api.postalpincode.in/pincode/${pin}`,
      { 
        timeout: 5000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      }
    );
    data = response.data;
  } catch (error) {
    throw new ApiError(503, "PIN service unavailable");
  }

  if (!data?.[0] || data[0].Status !== "Success") {
    throw new ApiError(404, "Invalid PIN code");
  }

  const postOffices = data[0].PostOffice;
  if (!postOffices || postOffices.length === 0) {
    throw new ApiError(404, "No post office found for this PIN code");
  }

  // 🔧 NORMALIZATION HELPER (KEY FIX)
  const normalize = (str = "") =>
    str
      .toLowerCase()
      .replace(/\(.*?\)/g, "")          // remove (Nalanda)
      .replace(/\s+urban/g, "")        // remove urban
      .replace(/\s+rural/g, "")        // remove rural
      .replace(/\s+north/g, "")        // remove north
      .replace(/\s+south/g, "")        // remove south
      .replace(/\s+east/g, "")         // remove east
      .replace(/\s+west/g, "")         // remove west
      .replace(/bengaluru/g, "bangalore") // alias
      .replace(/\s+/g, " ")
      .trim();

  // ✅ SMART CITY VALIDATION + FIND MATCHED POST OFFICE
  let matchedPostOffice = postOffices[0]; // fallback

  if (city) {
    const cityNorm = normalize(city);

    matchedPostOffice = postOffices.find(po => {
      const nameNorm = normalize(po.Name);
      const districtNorm = normalize(po.District);

      return (
        nameNorm === cityNorm ||
        nameNorm.startsWith(cityNorm) ||
        nameNorm.includes(cityNorm) ||
        districtNorm === cityNorm ||
        cityNorm.includes(districtNorm) ||
        districtNorm.includes(cityNorm)
      );
    });

    if (!matchedPostOffice) {
      throw new ApiError(400, "PIN does not match the provided city");
    }
  }

  // ✅ State validation
  if (
    state &&
    normalize(matchedPostOffice.State) !== normalize(state)
  ) {
    throw new ApiError(400, "PIN does not match the provided state");
  }

  const info = matchedPostOffice;

  const responseData = {
    pin,
    country: info.Country,
    state: info.State,
    district: info.District,
    city: info.Name,        // ✅ MATCHED CITY
    postOffice: info.Name,  // ✅ MATCHED POST OFFICE
    region: info.Region,
    division: info.Division
  };

  return res.status(200).json(
    ApiResponse.success(responseData, "PIN verified and address matched")
  );
});




/**
 * GET /api/location/pin/india/:pin
 */
export const autoFillByIndianPin = asyncHandler(async (req, res) => {
  const { pin } = req.params;

  if (!/^\d{6}$/.test(pin)) {
    throw new ApiError(400, "Invalid PIN format");
  }

  const response = await axios.get(
    `https://api.postalpincode.in/pincode/${pin}`,
    { 
      timeout: 5000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    }
  );

  const postOffices = response.data?.[0]?.PostOffice;
  if (!postOffices?.length) {
    throw new ApiError(404, "Wrong PIN code");
  }

  const first = postOffices[0];

  return res.status(200).json(
    ApiResponse.success(
      {
        pin,
        country: first.Country,
        state: first.State,
        district: first.District,
        defaultCity: first.Name,
        postOffices: postOffices.map(po => ({
          name: po.Name,
          branchType: po.BranchType,
          deliveryStatus: po.DeliveryStatus
        }))
      },
      "Auto-fill data fetched",
      { count: postOffices.length }
    )
  );
});

