import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import session from "express-session";
import passport from "passport";

import authRoutes from "./routes/auth.routes.js";
import initializePassport from "./config/passport.config.js";

dotenv.config();
const app = express();

// Initialize Passport
initializePassport();

// SESSION CONFIGURATION (Required for Google OAuth) 
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-session-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // false for localhost HTTP
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// ========== PASSPORT MIDDLEWARE ==========
app.use(passport.initialize());
app.use(passport.session());

// CORS Configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173", // fallback for Vite
    credentials: true,
  })
);

// Body parsers
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// Static folder
app.use(express.static("public"));

// Cookie parser
app.use(cookieParser());

// Routes
app.use("/api/v1/auth", authRoutes);

// Health Check Route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is running 🚀",
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    errors: err.errors || [],
  });
});

export { app };