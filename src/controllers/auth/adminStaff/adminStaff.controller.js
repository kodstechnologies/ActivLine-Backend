import { asyncHandler } from "../../../utils/AsyncHandler.js";
import ApiResponse from "../../../utils/ApiReponse.js";
import { validateCreateAdminStaff } from "../../../validations/auth/adminStaff/adminStaff.validation.js";
import * as AuthService from "../../../services/auth/adminStaff/adminStaff.service.js";
import { createActivityLog } from "../../../services/ActivityLog/activityLog.service.js";
import ApiError from "../../../utils/ApiError.js";
import { sendAdminStaffCreatedEmail } from "../../../utils/mail.util.js";

export const createAdminStaff = asyncHandler(async (req, res) => {
  validateCreateAdminStaff(req.body);

  // 🔐 Only ADMIN or SUPER_ADMIN can create users
  if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
    throw new ApiError(403, "Only ADMIN can create users");
  }

  const staff = await AuthService.createAdminStaff({
    ...req.body, // role comes from payload
    createdBy: req.user._id,
  });

  await createActivityLog({
    req,
    action: "CREATE",
    module: "ADMIN_STAFF",
    description: `Created admin staff: ${staff.name}`,
    targetId: staff.id,
  });

  setImmediate(() => {
    Promise.resolve(
      sendAdminStaffCreatedEmail({
        to: staff.email,
        name: staff.name,
        email: staff.email,
        password: req.body?.password,
        role: staff.role,
        status: staff.status || "ACTIVE",
      })
    ).catch((err) => {
      console.error("Staff create email failed:", err?.message || err);
    });
  });

  return res
    .status(201)
    .json(ApiResponse.success(staff, `${staff.role} created successfully`));
});
