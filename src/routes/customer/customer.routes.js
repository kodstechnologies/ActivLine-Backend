import { Router } from "express";
import {
  createCustomer,
  getCustomers,
  getCustomerById,
} from "../../controllers/customer/customer.controller.js";
import { upload } from "../../middlewares/multer.middleware.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";

const router = Router();

const maybeUploadCustomerFiles = (req, res, next) => {
  if (req.is("multipart/form-data")) {
    return upload.fields([
      { name: "idFile", maxCount: 1 },
      { name: "addressFile", maxCount: 1 },
      { name: "cafFile", maxCount: 1 },
      { name: "reportFile", maxCount: 1 },
      { name: "signFile", maxCount: 1 },
      { name: "profilePicFile", maxCount: 1 },
    ])(req, res, next);
  }
  return next();
};

router.post(
  "/create",
  maybeUploadCustomerFiles,
  createCustomer
);

// This route handles fetching all customers
router
  .route("/customers")
  .get(verifyJWT, allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN", "ADMIN_STAFF"), getCustomers);

// This new route handles fetching a single customer by their ID
router
  .route("/customers/:customerId")
  .get(verifyJWT, allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN", "ADMIN_STAFF"), getCustomerById);

export default router;
