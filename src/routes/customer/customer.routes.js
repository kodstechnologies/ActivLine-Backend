import { Router } from "express";
import {
  createCustomer,
  getCustomers,
  getCustomerById,
  getCustomerCityById,
  getCustomerOverviewByUserName,
  updateCustomer,
  updateCustomerByIdForFranchise,
  getCustomerMaintenanceDates,
  upsertCustomerMaintenanceDates,
  deleteCustomerMaintenanceDates,
  getCustomerMaintenanceDatesByAccountId,
  upsertCustomerMaintenanceDatesByAccountId,
  deleteCustomerMaintenanceDatesByAccountId,
  getMyAccountMaintenanceSummary,
  getMyProfileImage,
  updateMyProfileImage,
  deleteMyProfileImage,
} from "../../controllers/Customer/customer.controller.js";
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
      { name: "profileImage", maxCount: 1 },
    ])(req, res, next);
  }
  return next();
};

const maybeUploadProfileImage = (req, res, next) => {
  if (req.is("multipart/form-data")) {
    return upload.fields([
      { name: "profilePicFile", maxCount: 1 },
      { name: "profileImage", maxCount: 1 },
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

router.get(
  "/customers/username/:userName/overview",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN"),
  getCustomerOverviewByUserName
);

// This new route handles fetching a single customer by their ID
router
  .route("/customers/:customerId")
  .get(verifyJWT, allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN", "ADMIN_STAFF"), getCustomerById);

router.get(
  "/customers/:customerId/city",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN", "ADMIN_STAFF", "CUSTOMER"),
  getCustomerCityById
);

// Update customer by Activline userId
router.post(
  "/update/:activlineUserId",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN"),
  maybeUploadCustomerFiles,
  updateCustomer
);

router.patch(
  "/customers/:customerId/franchise-edit",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN"),
  maybeUploadCustomerFiles,
  updateCustomerByIdForFranchise
);

router.get(
  "/customers/:customerId/maintenance",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN"),
  getCustomerMaintenanceDates
);

router.post(
  "/customers/:customerId/maintenance",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN"),
  upsertCustomerMaintenanceDates
);

router.patch(
  "/customers/:customerId/maintenance",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN"),
  upsertCustomerMaintenanceDates
);

router.delete(
  "/customers/:customerId/maintenance",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN"),
  deleteCustomerMaintenanceDates
);

router.get(
  "/customers/account/me/maintenance",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN"),
  getMyAccountMaintenanceSummary
);

router.get(
  "/customers/account/:accountId/maintenance",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN", "CUSTOMER"),
  getCustomerMaintenanceDatesByAccountId
);

router.post(
  "/customers/account/:accountId/maintenance",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN", "CUSTOMER"),
  upsertCustomerMaintenanceDatesByAccountId
);

router.patch(
  "/customers/account/:accountId/maintenance",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN", "CUSTOMER"),
  upsertCustomerMaintenanceDatesByAccountId
);

router.delete(
  "/customers/account/:accountId/maintenance",
  verifyJWT,
  allowRoles("ADMIN", "SUPER_ADMIN", "FRANCHISE_ADMIN", "CUSTOMER"),
  deleteCustomerMaintenanceDatesByAccountId
);

router.get(
  "/me/profile-image",
  verifyJWT,
  allowRoles("CUSTOMER"),
  getMyProfileImage
);

router.put(
  "/me/profile-image",
  verifyJWT,
  allowRoles("CUSTOMER"),
  maybeUploadProfileImage,
  updateMyProfileImage
);

router.delete(
  "/me/profile-image",
  verifyJWT,
  allowRoles("CUSTOMER"),
  deleteMyProfileImage
);

export default router;
