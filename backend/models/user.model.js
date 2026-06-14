import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const userSchema = new mongoose.Schema(
  {
    // ========== AUTHENTICATION ==========
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      required: function () {
        return this.authProvider === "local";
      },
      minlength: 8,
      select: false,
    },

    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
      index: true,
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
      default: undefined,
    },

    // ========== PROFILE ==========
    userName: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    avatar: {
      type: String,
      default: "",
    },

    bio: {
      type: String,
      default: "",
      maxlength: 200,
    },

    phoneNumber: {
      type: String,
      default: "",
      trim: true,
    },

    // ========== ACCOUNT STATUS ==========
    accountVerified: {
      type: Boolean,
      default: false,
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    role: {
      type: String,
      enum: ["user", "recruiter"],
      default: "user",
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    // ========== TOKEN MANAGEMENT ==========
    refreshToken: {
      type: String,
      select: false,
    },

    tokenVersion: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// ========== INDEXES ==========
userSchema.index({ email: 1 });
userSchema.index({ userName: 1 });
userSchema.index({ authProvider: 1 });

// ========== PRE-SAVE HOOK - FIXED (no 'next' parameter when using async) ==========
userSchema.pre("save", async function () {
  // Only hash if password exists and is modified
  if (!this.isModified("password") || !this.password) {
    return;
  }
  
  this.password = await bcrypt.hash(this.password, 10);
});

// ========== INSTANCE METHODS ==========

// Compare password for local auth users
userSchema.methods.isPasswordCorrect = async function (password) {
  if (!this.password) return false;
  return await bcrypt.compare(password, this.password);
};

// Generate Access Token
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      userName: this.userName,
      fullName: this.fullName,
      role: this.role,
      tokenVersion: this.tokenVersion,
    },
    process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1d",
    }
  );
};

// Generate Refresh Token
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      tokenVersion: this.tokenVersion,
    },
    process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
    }
  );
};

// Update last login timestamp
userSchema.methods.updateLastLogin = async function () {
  this.lastLoginAt = new Date();
  await this.save({ validateBeforeSave: false });
};

// ========== TO JSON TRANSFORM ==========
userSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.refreshToken;
    delete ret.tokenVersion;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model("User", userSchema);