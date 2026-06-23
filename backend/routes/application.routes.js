import express from "express";
import {
  applyForOutsource,
  getAppliedOutsources,
  getApplicants,
  withdrawApplication,
  updateApplicationStatus,
  getApplicationStats,
  getApplicationById,
} from "../controllers/application.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = express.Router();

// ========== PROTECTED ROUTES (require authentication) ==========
router.use(verifyJWT);

// Apply to outsource
router.post("/outsource/:outsourceId/apply", applyForOutsource);

// Get my applications
router.get("/me", getAppliedOutsources);

// Get application stats
router.get("/stats", getApplicationStats);

// Get single application
router.get("/:applicationId", getApplicationById);

// Get applicants for an outsource (employer only)
router.get("/outsource/:outsourceId/applicants", getApplicants);

// Update application status (employer only)
router.patch("/:applicationId/status", updateApplicationStatus);

// Withdraw application (applicant only)
router.patch("/:applicationId/withdraw", withdrawApplication);

export default router;