import { asyncHandler } from "../../utils/AsyncHandler.js";
import { ApiResponse } from "../../utils/ApiReponse.js";
import {
  getAllCountries,
  getStatesByCountry,
  getCitiesByState
} from "../../services/Customer/location.service.js";


export const fetchCountries = asyncHandler(async (req, res) => {
  const countries = getAllCountries();

  return res.status(200).json(
    ApiResponse.success(countries, "Countries fetched successfully")
  );
});

export const fetchStates = asyncHandler(async (req, res) => {
  const { countryCode } = req.params;

  const states = getStatesByCountry(countryCode.toUpperCase());

  return res.status(200).json(
    ApiResponse.success(states, "States fetched successfully")
  );
});

export const fetchCities = asyncHandler(async (req, res) => {
  const { countryCode, stateCode } = req.params;

  const cities = getCitiesByState(countryCode.toUpperCase(), stateCode);

  return res.status(200).json(ApiResponse.success(cities, "Cities fetched successfully"));
});
