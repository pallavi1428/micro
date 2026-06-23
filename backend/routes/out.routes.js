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

// ========== PUBLIC ROUTES ==========
router.get("/", getAllOutsources);
router.get("/stats", getOutsourceStats);
router.get("/:outsourceId", getOutsourceById);
router.get("/user/:userId", getUserOutsources);

// ========== PROTECTED ROUTES (require login) ==========
router.use(verifyJWT);

router.post("/", createOutsource);
router.get("/me/outsources", getMyOutsources);
router.put("/:outsourceId", updateOutsource);
router.delete("/:outsourceId", deleteOutsource);
router.post("/:outsourceId/close", closeOutsource);

export default router;