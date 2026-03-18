import * as LogService from "../../services/ActivityLog/activityLog.service.js";
import * as Repo from "../../repositories/ActivityLog/activityLog.repository.js";
import ApiResponse from "../../utils/ApiReponse.js";
import { asyncHandler } from "../../utils/AsyncHandler.js";
import { getLogsSchema } from "../../validations/ActivityLog/activityLog.validation.js";
// src/controllers/auth/login.controller.js
import { createActivityLog } from "../../services/ActivityLog/activityLog.service.js";

const normalizeActorId = (actorId) => {
  if (!actorId || typeof actorId !== "object") return actorId;

  const firstLast = [actorId.firstName, actorId.lastName].filter(Boolean).join(" ");
  const name =
    actorId.name ||
    actorId.fullName ||
    actorId.userName ||
    (firstLast ? firstLast.trim() : null) ||
    null;

  const email = actorId.email || actorId.emailId || null;
  const phone = actorId.mobile || actorId.phoneNumber || null;

  return {
    _id: actorId._id,
    name,
    email,
    phone,
  };
};

const normalizeLogs = (logs = []) =>
  logs.map((log) => {
    const obj = log?.toObject ? log.toObject() : log;
    const normalizedActor = normalizeActorId(obj.actorId);
    return {
      ...obj,
      actorId: normalizedActor,
      actorName: obj.actorName || normalizedActor?.name || null,
    };
  });



export const getActivityLogs = asyncHandler(async (req, res) => {
  const { error, value } = getLogsSchema.validate(req.query);
  if (error) throw error;

  const { role, module, action, limit } = value;

  const filter = {};
  if (role) filter.actorRole = role;
  if (module) filter.module = module;
  if (action) filter.action = action;

  const logs = await Repo.getLogs(filter, limit);

  res.json(ApiResponse.success(normalizeLogs(logs), "Logs fetched successfully"));
});

/**
 * ✅ GET ALL LOGS (ADMIN, SUPER_ADMIN, ADMIN_STAFF)
 */
export const getAllLogs = asyncHandler(async (req, res) => {
  const { role, module, action, limit = 100 } = req.query;

  const filter = {};

  if (role) filter.actorRole = role.toUpperCase();
  if (module) filter.module = module.toUpperCase();
  if (action) filter.action = action.toUpperCase();

  const logs = await Repo.getLogs(filter, Number(limit));

  res.json(ApiResponse.success(normalizeLogs(logs), "Filtered logs fetched"));
});


/**
 * ✅ GET LOGS BY USER ID (ADMIN, SUPER_ADMIN)
 */
export const getLogsByUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { limit = 100 } = req.query;

  const logs = await Repo.getLogs(
    { actorId: userId },
    Number(limit)
  );

  res.json(ApiResponse.success(normalizeLogs(logs), "User logs fetched"));
});

/**
 * ✅ GET MY LOGS (STAFF / CUSTOMER / ANY USER)
 */
export const getMyLogs = asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;

  const logs = await Repo.getLogs(
    { actorId: req.user._id },
    Number(limit)
  );

  res.json(ApiResponse.success(normalizeLogs(logs), "My logs fetched"));
});
