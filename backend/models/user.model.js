/* File: backend/models/user.model.js */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// Validate required env variables (fail fast)
const requiredEnvVars = [
  "ACCESS_TOKEN_SECRET",
  "REFRESH_TOKEN_SECRET",
  "ACCESS_TOKEN_EXPIRY",
  "REFRESH_TOKEN_EXPIRY",
  "BCRYPT_ROUNDS",
];

requiredEnvVars.forEach((envVar) => {
  if (!process.env[envVar]) {
    throw new Error(`FATAL ERROR: ${envVar} is not defined`);
  }
});

const SECURITY = {
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS, 10),
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  VERIFICATION_CODE_EXPIRY: 10 * 60 * 1000, // 10 minutes
  RESET_PASSWORD_EXPIRY: 15 * 60 * 1000, // 15 minutes
  MAX_LOGIN_ATTEMPTS: 5,
  LOCK_TIME: 15 * 60 * 1000, // 15 minutes
  MAX_ACTIVE_SESSIONS: 5, // Max devices per user
};

/* ================================
   Session Sub-Schema
================================ */

const sessionSchema = new mongoose.Schema({
  refreshToken: {
    type: String,
    required: true,
  },
  deviceInfo: {
    type: String,
    default: "Unknown device",
  },
  ipAddress: {
    type: String,
    default: "",
  },
  userAgent: {
    type: String,
    default: "",
  },
  lastUsed: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  absoluteExpiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

/* ================================
   User Schema
================================ */

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },

    password: {
      type: String,
      required: true,
      minlength: SECURITY.PASSWORD_MIN_LENGTH,
      maxlength: SECURITY.PASSWORD_MAX_LENGTH,
      select: false,
    },

    userName: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      match: [
        /^[a-z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores",
      ],
    },

    fullname: {
      type: String,
      required: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      default: undefined,
    },

    skills: {
      type: [String],
      default: [],
    },

    profile: {
      bio: {
        type: String,
        default: "",
        trim: true,
        maxlength: 50,
      },
      avatar: { type: String, default: "" },
      coverImage: { type: String, default: "" },
    },

    resume: { type: String, default: "" },

    accountVerified: {
      type: Boolean,
      default: false,
    },

    verificationCode: {
      type: String,
      select: false,
    },

    verificationCodeExpire: {
      type: Date,
      select: false,
    },

    resetPasswordToken: {
      type: String,
      select: false,
    },

    resetPasswordExpire: {
      type: Date,
      select: false,
    },

    // Multi-device sessions
    sessions: {
      type: [sessionSchema],
      default: [],
      select: false,
    },

    // Legacy support (optional)
    refreshToken: {
      type: String,
      select: false,
    },

    loginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },

    lockUntil: {
      type: Date,
      select: false,
    },

    passwordChangedAt: {
      type: Date,
      select: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    deactivatedAt: {
      type: Date,
      select: false,
    },
  },
  { timestamps: true }
);

/* ================================
   Indexes
================================ */

userSchema.index({ email: 1 });
userSchema.index({ userName: 1 });
userSchema.index({ "sessions.refreshToken": 1 });
userSchema.index({ refreshToken: 1 });

/* ================================
   Password Hashing
================================ */

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(SECURITY.BCRYPT_ROUNDS);
    this.password = await bcrypt.hash(this.password, salt);

    // Subtract 1 second to avoid JWT edge-case invalidation
    this.passwordChangedAt = Date.now() - 1000;

    next();
  } catch (error) {
    next(error);
  }
});

/* ================================
   Instance Methods
================================ */

userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

/* ================================
   Virtuals
================================ */

userSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.virtual("activeSessionsCount").get(function () {
  if (!this.sessions) return 0;
  return this.sessions.filter(
    (s) =>
      s.expiresAt > Date.now() &&
      s.absoluteExpiresAt > Date.now()
  ).length;
});

/* ================================
   JSON Sanitization
================================ */

userSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.__v;
    delete ret.password;
    delete ret.verificationCode;
    delete ret.verificationCodeExpire;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpire;
    delete ret.sessions;
    delete ret.refreshToken;
    delete ret.loginAttempts;
    delete ret.lockUntil;
    delete ret.deactivatedAt;
    return ret;
  },
});

/* ================================
   Exports
================================ */

export const SecurityConfig = SECURITY;
export const User = mongoose.model("User", userSchema);
