import { Router } from "express";
import {
  createRelocation,
  getRelocations,
  updateRelocation,
  deleteRelocation,
  getMyRelocation,
} from "../../controllers/Customer/customerRelocation.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";

const router = Router();

// Protect all relocation endpoints with JWT
router.use(verifyJWT);

router
  .route("/me")
  .get(
    allowRoles("CUSTOMER"),
    getMyRelocation
  );

router
  .route("/")
  .post(
    allowRoles("CUSTOMER", "ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN"),
    createRelocation,
  )
  .get(
    allowRoles("CUSTOMER", "ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN"),
    getRelocations,
  );

router
  .route("/:relocationId")
  .put(
    allowRoles("CUSTOMER", "ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN"),
    updateRelocation,
  )
  .delete(
    allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN"),
    deleteRelocation,
  );

export default router;
