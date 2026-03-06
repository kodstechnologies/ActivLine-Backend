import express from "express";
import { getAllProfilesWithDetails } from "../../controllers/Customer/plan.controller.js";

const router = express.Router();

router.get("/full-details", getAllProfilesWithDetails);

export default router;