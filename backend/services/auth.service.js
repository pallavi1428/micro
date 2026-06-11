import { User } from "../models/user.model.js";
import { redisClient } from "../utils/redis.js";
import { ApiError } from "../utils/ApiError.js";
import { sendMail } from "../utils/sendMail.js";
import { getVerifyEmailHtml } from "../utils/emailTemplates.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import sanitize from "mongo-sanitize";
import { registerUserSchema } from "../validations/auth.validation.js";

class AuthService {
  constructor() {
    this.config = {
      RATE_LIMIT: {
        REGISTER: 60, // 60 seconds
        VERIFICATION_EXPIRY: 300, // 5 minutes
      },
      BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,
    };
  }

  /**
   * Complete user registration flow
   * @param {Object} body - Request body
   * @param {string} ip - Client IP address
   * @returns {Promise<Object>} Registration result
   */
  async registerUser(body, ip) {
    // 1️⃣ Sanitize input
    const cleanBody = sanitize(body);

    // 2️⃣ Validate input
    const validationResult = registerUserSchema.safeParse(cleanBody);
    if (!validationResult.success) {
      const formattedErrors = validationResult.error.issues.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));
      throw new ApiError(400, "Validation failed", formattedErrors);
    }

    const { fullname, email, password } = validationResult.data;

    // 3️⃣ Check rate limit
    await this._checkRateLimit(ip, email);

    // 4️⃣ Check if user exists
    await this._validateUserNotExists(email);

    // 5️⃣ Hash password
    const hashedPassword = await this._hashPassword(password);

    // 6️⃣ Create verification session
    const userData = { 
      fullname: fullname.trim(), 
      email: email.toLowerCase().trim(), 
      password: hashedPassword,
      ip 
    };
    
    const { verifyToken } = await this._createVerificationSession(userData);

    // 7️⃣ Send verification email (fire and forget)
    this._sendVerificationEmail(fullname, email, verifyToken).catch(err => {
      console.error("Failed to send verification email:", err);
    });

    // 8️⃣ Apply rate limit
    await this._applyRateLimit(ip, email);

    return {
      success: true,
      message: "If the email is valid, a verification link has been sent. It expires in 5 minutes."
    };
  }

  /**
   * Complete user verification flow
   * @param {string} token - Verification token
   * @returns {Promise<Object>} Verified user data
   */
  async verifyUser(token) {
    // 1️⃣ Validate token
    if (!token) {
      throw new ApiError(400, "Verification token is required.");
    }

    // 2️⃣ Get and validate verification data
    const { verifyKey, userData } = await this._getVerificationData(token);

    // 3️⃣ Create user in database
    const newUser = await this._createUser(userData);

    // 4️⃣ Clean up Redis key (fire and forget)
    this._deleteVerificationKey(verifyKey).catch(console.error);

    // 5️⃣ Return sanitized user
    return this._sanitizeUser(newUser);
  }

  /**
   * Private: Check rate limit
   */
  async _checkRateLimit(ip, email) {
    try {
      const rateLimitKey = `register:rate-limit:${ip}:${email}`;
      const isRateLimited = await redisClient.get(rateLimitKey);
      
      if (isRateLimited) {
        const remainingTime = await redisClient.ttl(rateLimitKey);
        throw new ApiError(
          429,
          `Too many registration attempts. Please wait ${remainingTime} seconds before trying again.`
        );
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, "Service temporarily unavailable. Please try again later.");
    }
  }

  /**
   * Private: Apply rate limit
   */
  async _applyRateLimit(ip, email) {
    try {
      const rateLimitKey = `register:rate-limit:${ip}:${email}`;
      await redisClient.set(rateLimitKey, "1", { 
        EX: this.config.RATE_LIMIT.REGISTER 
      });
    } catch (error) {
      console.error("Failed to apply rate limit:", error);
      // Non-critical error - don't throw
    }
  }

  /**
   * Private: Validate user doesn't exist
   */
  async _validateUserNotExists(email) {
    try {
      const existingUser = await User.findOne({ email }).select("_id");
      if (existingUser) {
        throw new ApiError(
          409,
          "An account with this email already exists. Please login or reset your password."
        );
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Database error while checking user existence");
    }
  }

  /**
   * Private: Hash password
   */
  async _hashPassword(password) {
    try {
      return await bcrypt.hash(password, this.config.BCRYPT_ROUNDS);
    } catch (error) {
      throw new ApiError(500, "Error processing password. Please try again.");
    }
  }

  /**
   * Private: Create verification session
   */
  async _createVerificationSession(userData) {
    try {
      const verifyToken = crypto.randomBytes(32).toString("hex");
      const verifyKey = `verify:session:${verifyToken}`;
      
      const dataToStore = {
        ...userData,
        createdAt: Date.now(),
      };
      
      await redisClient.set(
        verifyKey, 
        JSON.stringify(dataToStore), 
        { EX: this.config.RATE_LIMIT.VERIFICATION_EXPIRY }
      );
      
      return { verifyToken, verifyKey };
    } catch (error) {
      throw new ApiError(503, "Failed to create verification session. Please try again.");
    }
  }

  /**
   * Private: Get verification data
   */
  async _getVerificationData(token) {
    try {
      const verifyKey = `verify:session:${token}`;
      const userDataJson = await redisClient.get(verifyKey);
      
      if (!userDataJson) {
        throw new ApiError(400, "The verification link is invalid or has expired. Please request a new one.");
      }
      
      const userData = JSON.parse(userDataJson);
      
      // Validate data integrity
      if (!userData.email || !userData.fullname || !userData.password) {
        await redisClient.del(verifyKey);
        throw new ApiError(400, "Invalid verification data. Please register again.");
      }
      
      return { verifyKey, userData };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, "Service temporarily unavailable. Please try again later.");
    }
  }

  /**
   * Private: Create user in database
   */
  async _createUser(userData) {
    try {
      const userName = await this._generateUniqueUsername(userData.fullname);
      
      const newUser = await User.create({
        fullname: userData.fullname,
        email: userData.email,
        password: userData.password,
        userName,
        accountVerified: true,
      });

      if (!newUser) {
        throw new Error("User creation failed");
      }

      return newUser;
    } catch (error) {
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        throw new ApiError(409, `${field} already exists. Please try again.`);
      }
      throw new ApiError(500, "Failed to create user account. Please try again.");
    }
  }

  /**
   * Private: Generate unique username
   */
  async _generateUniqueUsername(fullname) {
    try {
      const baseUsername = fullname
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 25);

      if (!baseUsername || baseUsername.length < 3) {
        const randomStr = crypto.randomBytes(4).toString("hex");
        return `user${randomStr}`;
      }

      let username = baseUsername;
      let counter = 1;
      let maxAttempts = 100;

      while (await User.findOne({ userName: username }).select("_id")) {
        if (counter >= maxAttempts) {
          const randomStr = crypto.randomBytes(4).toString("hex");
          return `user${randomStr}`;
        }
        
        const suffix = counter.toString();
        const availableSpace = 30 - suffix.length;
        username = baseUsername.slice(0, availableSpace) + suffix;
        counter++;
      }

      return username;
    } catch (error) {
      // Fallback to random username
      return `user${crypto.randomBytes(4).toString("hex")}`;
    }
  }

  /**
   * Private: Send verification email
   */
  async _sendVerificationEmail(fullname, email, token) {
    const verificationLink = `${process.env.FRONTEND_URL}/verify-email/${token}`;
    const subject = `Verify your email for ${process.env.APP_NAME || "Account Creation"}`;
    const html = getVerifyEmailHtml({
      fullname,
      verificationLink,
      appName: process.env.APP_NAME,
    });

    await sendMail({ email, subject, html });
  }

  /**
   * Private: Delete verification key
   */
  async _deleteVerificationKey(verifyKey) {
    try {
      await redisClient.del(verifyKey);
    } catch (error) {
      console.error("Failed to delete verification key:", error);
    }
  }

  /**
   * Private: Sanitize user for response
   */
  _sanitizeUser(user) {
    return {
      id: user._id,
      fullname: user.fullname,
      email: user.email,
      userName: user.userName,
      avatar: user.avatar,
      role: user.role,
      accountVerified: user.accountVerified,
      createdAt: user.createdAt,
    };
  }
}

// Export singleton instance
export const authService = new AuthService();