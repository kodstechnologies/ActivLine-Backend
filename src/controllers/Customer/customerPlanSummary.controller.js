import { asyncHandler } from "../../utils/AsyncHandler.js";
import ApiResponse from "../../utils/ApiReponse.js";
import ApiError from "../../utils/ApiError.js";
import Customer from "../../models/Customer/customer.model.js";
import { getCustomerPlanSummary as fetchCustomerPlanSummary } from "../../services/Customer/customerPlanSummary.service.js";

export const getCustomerPlanSummary = asyncHandler(async (req, res) => {
  const customerId = req.user?._id;

  const result = await fetchCustomerPlanSummary(customerId);

  return res.status(200).json(
    ApiResponse.success(result, "Customer plan summary fetched successfully")
  );
});

export const getCustomerPlanSummaryById = asyncHandler(async (req, res) => {
  const tokenCustomerId = req.user?._id;
  const paramId = String(req.params.customerId || "").trim();

  if (!tokenCustomerId) {
    throw new ApiError(401, "Unauthorized");
  }

  let resolvedCustomerId = tokenCustomerId;

  if (paramId && String(tokenCustomerId) !== paramId) {
    const customer = await Customer.findOne({
      activlineUserId: paramId,
    })
      .select("_id")
      .lean();

    if (!customer || String(customer._id) !== String(tokenCustomerId)) {
      throw new ApiError(403, "Access denied");
    }

    resolvedCustomerId = customer._id;
  }

  const result = await fetchCustomerPlanSummary(resolvedCustomerId);

  return res.status(200).json(
    ApiResponse.success(result, "Customer plan summary fetched successfully")
  );
});
