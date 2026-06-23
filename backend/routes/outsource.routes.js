import express from "express";
import {
  createOutsource,
  getAllOutsources,
  getOutsourceById,
  getUserOutsources,
  getMyOutsources,
  updateOutsource,
  deleteOutsource,
  closeOutsource,
  getOutsourceStats,
} from "../controllers/outsource.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Public routes (no authentication required)
router.get("/", getAllOutsources);
router.get("/stats", getOutsourceStats);
router.get("/:outsourceId", getOutsourceById);

// Protected routes (authentication required)
router.use(verifyJWT); // Apply authentication to all routes below

router.post("/", createOutsource);
router.get("/user/me", getMyOutsources);
router.get("/user/:userId", getUserOutsources);
router.patch("/:outsourceId", updateOutsource);
router.delete("/:outsourceId", deleteOutsource);
router.patch("/:outsourceId/close", closeOutsource);

export default router;