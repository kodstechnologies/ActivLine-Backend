import ApiError from "../../utils/ApiError.js";
import * as LogoutRepo from "../../repositories/auth/logout.repository.js";

/**
 * LOGOUT SERVICE
 *
 * Supports:
 * 1) FCM-only logout (mobile/device)
 * 2) Full logout (web / normal)
 *
 * RULES:
 * - ADMIN -> clear tokens only
 * - ADMIN_STAFF -> clear tokens only (status changes only by admin action)
 * - TERMINATED staff -> status never changed
 * - Idempotent (safe to call multiple times)
 */
export const logoutService = async ({ userId, fcmToken }) => {
  // Fetch user
  const user = await LogoutRepo.findUserById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  /**
   * CASE 1: FCM token logout only
   * (Mobile logout / device removal)
   */
  if (fcmToken) {
    await LogoutRepo.removeFCMToken(userId, fcmToken);
    return true;
  }

  /**
   * CASE 2: FULL LOGOUT
   */

  // 1) Clear refresh token + all FCM tokens
  await LogoutRepo.clearSession(userId);

  // 2) ADMIN_STAFF -> do NOT change status on logout
  // Status is controlled by admin actions only.

  return true;
};
