import * as Repo from "../../repositories/ActivityLog/activityLog.repository.js";
import Admin from "../../models/auth/auth.model.js";
import FranchiseAdmin from "../../models/Franchise/franchiseAdmin.model.js";
import Customer from "../../models/Customer/customer.model.js";
import Staff from "../../models/staff/Staff.model.js";

export const createActivityLog = async ({
  req,
  user,
  action,
  module,
  description,
  targetId = null,
  metadata = {},
}) => {
  const actorRef = user || req?.user;
  if (!actorRef) return;

  let actor = null;
  let actorModelName = null;

  // 🔹 fetch full user based on role
  switch (actorRef.role) {
    case "ADMIN":
    case "SUPER_ADMIN":
      actor = await Admin.findById(actorRef._id).lean();
      actorModelName = "Admin";
      break;

    case "STAFF":
      actor = await Staff.findById(actorRef._id).lean();
      actorModelName = "Staff";
      break;
    case "ADMIN_STAFF":
      actor = await Admin.findById(actorRef._id).lean();
      if (actor) {
        actorModelName = "Admin";
      } else {
        actor = await Staff.findById(actorRef._id).lean();
        actorModelName = actor ? "Staff" : null;
      }
      break;

    case "CUSTOMER":
      actor = await Customer.findById(actorRef._id).lean();
      actorModelName = "Customer";
      break;
    case "FRANCHISE_ADMIN":
      actor = await FranchiseAdmin.findById(actorRef._id).lean();
      actorModelName = "FranchiseAdmin";
      break;

    default:
      return;
  }

  if (!actor) return;

  await Repo.createLog({
    actorId: actor._id,
    actorModel: actorModelName,
    actorRole: actorRef.role,
    actorName: actor.name || actor.fullName,
    action,
    module,
    description,
    targetId,
    metadata,
    ipAddress: req?.ip,
    userAgent: req?.headers["user-agent"],
  });
};
