import { Router } from "express";
import { fetchFranchiseAccounts } from "../../controllers/franchise/franchise.controller.js";
import { fetchAllAdmins } from "../../controllers/franchise/f.admin.controller.js";
import { fetchSubPlans } from "../../controllers/franchise/subPlan.controller.js";
import { upload } from "../../utils/multerConfig.js"; // adjust path if needed

const router = Router();


router.post(
  "/admins",
  upload.none(), // 👈 THIS IS THE KEY LINE
  fetchAllAdmins
);

router.get("/sub-plans/:groupId", fetchSubPlans);
// 🔹 Franchise APIs
router.get("/", fetchFranchiseAccounts);
router.get("/:accountId", fetchFranchiseAccounts);
router.get("/", fetchFranchiseAccounts);


// 🔹 Franchise → Admin API (FORM-DATA SUPPORT)


export default router;
