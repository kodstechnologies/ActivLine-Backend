import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiError from "../../utils/ApiError.js";
import { renewUserPlan } from "../../services/Customer/renew.service.js";

// export const renew = asyncHandler(async (req, res) => {
//   const payload = req.body || {};

//   const userId = payload.userId;
//   const renewDefaultSettings = payload.renewDefaultSettings;
//   const isRenewPresentDate = payload.isRenewPresentDate;

//   if (!userId || !renewDefaultSettings || !isRenewPresentDate) {
//     throw new ApiError(
//       400,
//       "userId, renewDefaultSettings, and isRenewPresentDate are required"
//     );
//   }

//   const activlineResponse = await renewUserPlan(payload);

//   const { errorCode, status, message, ...rest } = activlineResponse || {};
//   const statusCode =
//     typeof errorCode === "number"
//       ? errorCode
//       : status === "success"
//         ? 200
//         : 500;
//   const success = status === "success" || statusCode < 400;

//   return res.status(statusCode).json({
//     success,
//     message: message || (success ? "Success" : "Error"),
//     data: {
//       status,
//       ...rest,
//       statusCode,
//     },
//   });
// });


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

  const { errorCode, status, message, ...rest } = activlineResponse || {};

  const statusCode =
    typeof errorCode === "number"
      ? errorCode
      : status === "success"
      ? 200
      : 500;

  const success = status === "success" || statusCode < 400;

  return res.status(statusCode).json({
    success,
    message: message || "Request processed",
    data: {
      status: status === "success", // ✅ true / false
      ...rest,
      statusCode,
    },
  });
});