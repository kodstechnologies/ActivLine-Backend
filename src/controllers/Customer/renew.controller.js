import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiError from "../../utils/ApiError.js";
import { renewUserPlan } from "../../services/Customer/renew.service.js";

export const renew = asyncHandler(async (req, res) => {
  const payload = req.body || {};

  const userId = payload.userId;
  const renewDefaultSettings = payload.renewDefaultSettings;
  const isRenewPresentDate = payload.isRenewPresentDate;

  if (!userId || !renewDefaultSettings || !isRenewPresentDate) {
    throw new ApiError(
      400,
      "userId, renewDefaultSettings, and isRenewPresentDate are required"
    );
  }

  const activlineResponse = await renewUserPlan(payload);

  return res.status(200).json(activlineResponse);
});
