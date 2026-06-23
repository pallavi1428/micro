import express from "express";
import passport from "passport";
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  getCurrentUser,
  getAllUsers,
  getUserById,
  deleteUser,
  changeUserPassword,
  updateUserProfile,
  googleAuthCallback,
} from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Public routes (no authentication needed)
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/refresh-token", refreshAccessToken);
//router.get("/google/callback", googleAuthCallback);
router.get("/users", getAllUsers);
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login", session: true }),
  googleAuthCallback
);

// Protected routes (require authentication)
router.use(verifyJWT); 

router.post("/logout", logoutUser);
router.get("/me", getCurrentUser);
router.post("/change-password", changeUserPassword);
router.put("/profile", updateUserProfile);

router.get("/users/:userId", getUserById);
router.delete("/users/:userId", deleteUser);

export default router;