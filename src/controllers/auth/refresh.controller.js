import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import { refreshAccessToken } from "../../services/auth/refresh.service.js";

export const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

  const { accessToken } = await refreshAccessToken({ refreshToken });

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (matches login cookie behavior)
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .json(ApiResponse.success({ accessToken }, "Access token refreshed"));
});

