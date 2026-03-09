import express from "express";
import { createCustomer, updateCustomer,getMyProfile, updateOwnFranchiseCustomer, deleteOwnFranchiseCustomer } from "../../controllers/Customer/customer.controller.js";
import { upload } from "../../middlewares/multer.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { createCustomerSchema } from "../../validations/Customer/customer.validation.js";
import { loginCustomer } from "../../controllers/Customer/customer.controller.js";
import { verifyAccessToken } from "../../middlewares/auth.middleware.js";
import { verifyJWT,auth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { updateCustomerReferralCode,getAllCustomers,getSingleCustomer,getCustomersByFranchise } from "../../controllers/Customer/customer.controller.js";
import { getMyReferralCode,getProfileImage,updateProfileImage,deleteProfileImage } from "../../controllers/Customer/customer.controller.js";

const router = express.Router();

router.post(
  "/create",
  
 upload.fields([
  { name: "idFile", maxCount: 1 },
  { name: "addressFile", maxCount: 1 },
  { name: "cafFile", maxCount: 1 },
  { name: "reportFile", maxCount: 1 },
  { name: "signFile", maxCount: 1 },
  { name: "profilePicFile", maxCount: 1 },
]),
  validate(createCustomerSchema), // ✅ validation after multer
  createCustomer
);

router.post(
  "/update/:activlineUserId",
  upload.fields([
    { name: "idFile", maxCount: 1 },
    { name: "addressFile", maxCount: 1 },
  ]),
  updateCustomer
);

router.patch(
  "/customers/:customerId/franchise-edit",
  verifyJWT,
  allowRoles("FRANCHISE_ADMIN"),
  upload.fields([
    { name: "idFile", maxCount: 1 },
    { name: "addressFile", maxCount: 1 },
  ]),
  updateOwnFranchiseCustomer
);

router.delete(
  "/customers/:customerId/franchise-delete",
  verifyJWT,
  allowRoles("FRANCHISE_ADMIN"),
  deleteOwnFranchiseCustomer
);


router.post("/login", express.json(), upload.none(), loginCustomer);

router.get("/me", verifyJWT, getMyProfile);

router.patch(
  "/customer/referral",
  verifyJWT,
  allowRoles(
    "SUPER_ADMIN",
    "ADMIN",
    "ADMIN_STAFF",
    "SUPER_ADMIN_STAFF"
  ),
  updateCustomerReferralCode
);


router.get(
  "/referral-code",
  verifyJWT,
  allowRoles("CUSTOMER"),
  getMyReferralCode
);

// routes/customer.routes.js

router.get("/me/profile-image", verifyJWT, auth("CUSTOMER"), getProfileImage);

router.put(
  "/me/profile-image",
  verifyJWT,
  auth("CUSTOMER"),
  upload.single("profilePicFile"),
  updateProfileImage
);

router.delete(
  "/me/profile-image",
  verifyJWT,
  auth("CUSTOMER"),
  deleteProfileImage
);
router.get(
  "/customers",
  verifyJWT,
  allowRoles("SUPER_ADMIN", "ADMIN", "ADMIN_STAFF", "FRANCHISE_ADMIN"),
  getAllCustomers
);
router.get(
  "/customers/:accountId",
  verifyJWT,
  allowRoles("SUPER_ADMIN", "ADMIN", "ADMIN_STAFF", "FRANCHISE_ADMIN"),
  getCustomersByFranchise
);
router.get(
  "/customers/:customerId",
  verifyJWT,
  allowRoles("SUPER_ADMIN", "ADMIN", "ADMIN_STAFF", "FRANCHISE_ADMIN"),
  getSingleCustomer
);


export default router;
