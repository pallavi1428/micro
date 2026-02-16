/* File: backend/services/auth.service.js */
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { User, SecurityConfig } from "../models/user.model.js";

class AuthService {
  constructor() {
    this.accessSecret = process.env.ACCESS_TOKEN_SECRET;
    this.refreshSecret = process.env.REFRESH_TOKEN_SECRET;
    this.accessExpiry = process.env.ACCESS_TOKEN_EXPIRY || "15m";
    this.refreshExpiry = process.env.REFRESH_TOKEN_EXPIRY || "7d";
    
    this.issuer = process.env.JWT_ISSUER || 'micro@lanceto@hobital';
    this.audience = process.env.JWT_AUDIENCE || 'microlancer';
    
    // For Upwork-style platform: 30-45 days absolute expiry
    this.absoluteExpiryDays = parseInt(process.env.ABSOLUTE_SESSION_EXPIRY_DAYS) || 30;
    
    // High-risk action threshold (5 minutes)
    this.highRiskThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    // Optional: Enable refresh token reuse detection
    this.enableReuseDetection = process.env.ENABLE_REUSE_DETECTION === 'true' || false;
  }

  // ================= HELPER FUNCTIONS =================
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  parseExpiryToMs(expiry) {
    if (!expiry || typeof expiry !== 'string') return 7 * 24 * 60 * 60 * 1000;
    
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1), 10);
    
    if (isNaN(value)) return 7 * 24 * 60 * 60 * 1000;

    switch (unit) {
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'm': return value * 60 * 1000;
      case 's': return value * 1000;
      default: return 7 * 24 * 60 * 60 * 1000;
    }
  }

  generateCode() {
    const code = crypto.randomInt(100000, 1000000).toString();
    const hashedCode = this.hashToken(code);
    return {
      plainCode: code,
      hashedCode,
      expiresAt: Date.now() + SecurityConfig.VERIFICATION_CODE_EXPIRY,
    };
  }

  verifyCode(plainCode, hashedCode, expiresAt) {
    if (!hashedCode || !expiresAt) return false;
    if (expiresAt < Date.now()) return false;

    const hashedInput = this.hashToken(plainCode);

    try {
      return crypto.timingSafeEqual(
        Buffer.from(hashedInput),
        Buffer.from(hashedCode)
      );
    } catch {
      return hashedInput === hashedCode;
    }
  }

  // ================= TOKEN GENERATION =================
  generateTokens(user, deviceInfo = {}) {
    const now = Date.now();
    const refreshExpiryMs = this.parseExpiryToMs(this.refreshExpiry);
    const absoluteExpiryMs = this.absoluteExpiryDays * 24 * 60 * 60 * 1000;
    
    // Session expiry is just refresh expiry (sliding window)
    const sessionExpiryMs = refreshExpiryMs;
    
    const accessToken = jwt.sign(
      {
        id: user._id,
        email: user.email,
        userName: user.userName,
        fullname: user.fullname,
        type: 'access',
      },
      this.accessSecret,
      {
        expiresIn: this.accessExpiry,
        issuer: this.issuer,
        audience: this.audience,
      }
    );

    // Refresh token includes absolute expiry as a claim
    const refreshToken = jwt.sign(
      { 
        id: user._id,
        type: 'refresh',
        absoluteExpiry: now + absoluteExpiryMs, // Hard absolute expiry
      },
      this.refreshSecret,
      {
        expiresIn: this.refreshExpiry,
        issuer: this.issuer,
        audience: this.audience,
      }
    );

    return {
      accessToken,
      refreshToken,
      hashedRefreshToken: this.hashToken(refreshToken),
      expiresAt: new Date(now + sessionExpiryMs), // Sliding window expiry (e.g., 7 days)
      absoluteExpiresAt: new Date(now + absoluteExpiryMs), // Hard stop (e.g., 30 days)
      deviceInfo: deviceInfo.deviceName || 'Unknown device',
      ipAddress: deviceInfo.ipAddress || '',
      userAgent: deviceInfo.userAgent || '',
    };
  }

  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.accessSecret, {
        issuer: this.issuer,
        audience: this.audience,
      });
    } catch {
      return null;
    }
  }

  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.refreshSecret, {
        issuer: this.issuer,
        audience: this.audience,
      });
    } catch {
      return null;
    }
  }

  // ================= HIGH-RISK ACTION CHECK =================
  // For Upwork-style: Require recent auth for sensitive actions
  isRecentAuth(accessToken) {
    try {
      const decoded = jwt.verify(accessToken, this.accessSecret, {
        issuer: this.issuer,
        audience: this.audience,
      });
      
      const tokenAge = Date.now() - (decoded.iat * 1000);
      return tokenAge <= this.highRiskThreshold;
    } catch {
      return false;
    }
  }

  // ================= AUTHENTICATION =================
  async authenticate(identifier, password) {
    const normalizedIdentifier = String(identifier || '').toLowerCase().trim();
    
    if (!normalizedIdentifier || !password) {
      return { user: null, error: 'Invalid credentials' };
    }

    const user = await User.findOne({
      $or: [
        { email: normalizedIdentifier },
        { userName: normalizedIdentifier }
      ]
    }).select('+password +loginAttempts +lockUntil +accountVerified +isActive');

    if (!user) return { user: null, error: 'Invalid credentials' };

    if (!user.accountVerified) return { user: null, error: 'Please verify your email' };
    if (!user.isActive) return { user: null, error: 'Account is deactivated' };
    if (user.isLocked) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return { user: null, error: `Too many attempts. Try again in ${minutesLeft} minutes.` };
    }

    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= SecurityConfig.MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = Date.now() + SecurityConfig.LOCK_TIME;
      }
      await user.save({ validateBeforeSave: false });
      return { user: null, error: 'Invalid credentials' };
    }

    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save({ validateBeforeSave: false });

    return { user, error: null };
  }

  // ================= SESSION MANAGEMENT =================
  async addSession(user, tokenData) {
    if (!user.sessions) user.sessions = [];

    // Clean expired sessions (both sliding and absolute)
    user.sessions = user.sessions.filter(s => 
      s.expiresAt > Date.now() && s.absoluteExpiresAt > Date.now()
    );

    // FIFO session rotation
    if (user.sessions.length >= SecurityConfig.MAX_ACTIVE_SESSIONS) {
      user.sessions.sort((a, b) => a.lastUsed - b.lastUsed);
      user.sessions.shift();
    }

    user.sessions.push({
      refreshToken: tokenData.hashedRefreshToken,
      deviceInfo: tokenData.deviceInfo,
      ipAddress: tokenData.ipAddress,
      userAgent: tokenData.userAgent,
      lastUsed: new Date(),
      expiresAt: tokenData.expiresAt, // Sliding window expiry
      absoluteExpiresAt: tokenData.absoluteExpiresAt, // Hard stop expiry
      createdAt: new Date(),
    });

    user.refreshToken = tokenData.hashedRefreshToken;
    await user.save({ validateBeforeSave: false });
  }

  async findUserByRefreshToken(refreshToken) {
    if (!refreshToken) return null;
    
    const hashedToken = this.hashToken(refreshToken);
    
    const user = await User.findOne({
      $or: [
        { 'sessions.refreshToken': hashedToken },
        { refreshToken: hashedToken }
      ]
    }).select('+sessions +refreshToken +accountVerified +isActive +passwordChangedAt');

    return user;
  }

  // 🔴 FIX: Complete refreshTokens with type validation and optional reuse detection
  async refreshTokens(refreshToken) {
    if (!refreshToken) {
      return { accessToken: null, error: 'Refresh token required' };
    }

    const decoded = this.verifyRefreshToken(refreshToken);
    if (!decoded) return { accessToken: null, error: 'Invalid refresh token' };

    // 🔴 NEW: Validate token type
    if (decoded.type !== 'refresh') {
      return { accessToken: null, error: 'Invalid token type' };
    }

    const user = await this.findUserByRefreshToken(refreshToken);
    
    // 🔴 OPTIONAL: Advanced reuse detection
    if (!user && this.enableReuseDetection) {
      // Token was valid but not found in DB - possible theft
      // Find user by ID from decoded token and nuke all sessions
      const possibleUser = await User.findById(decoded.id).select('+sessions +refreshToken');
      if (possibleUser) {
        console.warn(`⚠️ Possible refresh token reuse detected for user ${possibleUser._id}`);
        possibleUser.sessions = [];
        possibleUser.refreshToken = undefined;
        await possibleUser.save({ validateBeforeSave: false });
      }
      return { accessToken: null, error: 'Session expired' };
    }

    if (!user) return { accessToken: null, error: 'Session expired' };

    if (!user.accountVerified) return { accessToken: null, error: 'Account not verified' };
    if (!user.isActive) return { accessToken: null, error: 'Account deactivated' };

    const hashedToken = this.hashToken(refreshToken);
    const session = user.sessions?.find(s => s.refreshToken === hashedToken);
    
    // Check 1: Token claim absolute expiry
    if (decoded.absoluteExpiry && decoded.absoluteExpiry < Date.now()) {
      if (session) {
        user.sessions = user.sessions.filter(s => s.refreshToken !== hashedToken);
        await user.save({ validateBeforeSave: false });
      }
      return { accessToken: null, error: 'Session expired (absolute limit reached)' };
    }

    // Check 2: DB absolute expiry (more trustworthy)
    if (session && session.absoluteExpiresAt < Date.now()) {
      user.sessions = user.sessions.filter(s => s.refreshToken !== hashedToken);
      await user.save({ validateBeforeSave: false });
      return { accessToken: null, error: 'Session expired (absolute limit reached)' };
    }

    // Check password changed after token issuance
    if (user.passwordChangedAt) {
      const tokenIssuedAt = decoded.iat * 1000;
      if (user.passwordChangedAt > tokenIssuedAt) {
        return { accessToken: null, error: 'Token invalidated by password change' };
      }
    }

    // Generate new tokens with consistent type fields
    const newAccessToken = jwt.sign(
      { 
        id: user._id, 
        email: user.email, 
        userName: user.userName, 
        fullname: user.fullname,
        type: 'access'
      },
      this.accessSecret,
      {
        expiresIn: this.accessExpiry,
        issuer: this.issuer,
        audience: this.audience,
      }
    );

    const absoluteExpiry = session?.absoluteExpiresAt?.getTime() || 
                          decoded.absoluteExpiry || 
                          Date.now() + (this.absoluteExpiryDays * 24 * 60 * 60 * 1000);
    
    const newRefreshToken = jwt.sign(
      { 
        id: user._id,
        type: 'refresh',
        absoluteExpiry,
      },
      this.refreshSecret,
      {
        expiresIn: this.refreshExpiry,
        issuer: this.issuer,
        audience: this.audience,
      }
    );

    const hashedNewRefresh = this.hashToken(newRefreshToken);
    const expiryMs = this.parseExpiryToMs(this.refreshExpiry);

    // Update session
    if (session) {
      const sessionIndex = user.sessions.findIndex(s => s.refreshToken === hashedToken);
      if (sessionIndex > -1) {
        user.sessions[sessionIndex].refreshToken = hashedNewRefresh;
        user.sessions[sessionIndex].lastUsed = new Date();
        user.sessions[sessionIndex].expiresAt = new Date(Date.now() + expiryMs);
        // absoluteExpiresAt remains unchanged - hard stop doesn't extend
      }
    } else {
      // Legacy session handling
      if (!user.sessions) user.sessions = [];
      user.sessions.push({
        refreshToken: hashedNewRefresh,
        deviceInfo: 'Legacy Device',
        lastUsed: new Date(),
        expiresAt: new Date(Date.now() + expiryMs),
        absoluteExpiresAt: new Date(absoluteExpiry),
        createdAt: new Date(),
      });
    }

    user.refreshToken = hashedNewRefresh;
    await user.save({ validateBeforeSave: false });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      error: null
    };
  }

  async logout(refreshToken) {
    if (!refreshToken) return;

    const hashedToken = this.hashToken(refreshToken);
    const user = await User.findOne({
      $or: [
        { 'sessions.refreshToken': hashedToken },
        { refreshToken: hashedToken }
      ]
    }).select('+sessions +refreshToken');

    if (!user) return;

    if (user.sessions) {
      user.sessions = user.sessions.filter(s => s.refreshToken !== hashedToken);
    }

    if (user.refreshToken === hashedToken) {
      user.refreshToken = undefined;
    }

    await user.save({ validateBeforeSave: false });
  }

  async logoutAll(userId) {
    if (!userId) return;
    
    const user = await User.findById(userId).select('+sessions +refreshToken');
    if (!user) return;

    user.sessions = [];
    user.refreshToken = undefined;
    await user.save({ validateBeforeSave: false });
  }

  // ================= PASSWORD MANAGEMENT =================
  generateResetToken() {
    const resetToken = crypto.randomBytes(20).toString('hex');
    return {
      plainToken: resetToken,
      hashedToken: this.hashToken(resetToken),
      expiresAt: Date.now() + SecurityConfig.RESET_PASSWORD_EXPIRY,
    };
  }

  async changePassword(userId, currentPassword, newPassword) {
    if (!userId) return { success: false, error: 'User ID required' };
    
    const user = await User.findById(userId).select('+password');
    if (!user) return { success: false, error: 'User not found' };

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return { success: false, error: 'Current password is incorrect' };

    user.password = newPassword;
    user.passwordChangedAt = new Date();
    user.refreshToken = undefined;
    user.sessions = [];
    await user.save();

    return { success: true, error: null };
  }

  async resetPassword(user, newPassword) {
    if (!user) return;
    
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.refreshToken = undefined;
    user.sessions = [];
    await user.save();
  }

  // ================= GET SESSIONS =================
  async getUserSessions(userId, currentRefreshToken) {
    if (!userId) return [];
    
    const user = await User.findById(userId).select('+sessions');
    if (!user || !user.sessions) return [];

    const currentHashed = currentRefreshToken ? this.hashToken(currentRefreshToken) : null;
    
    return user.sessions
      .filter(s => s.expiresAt > Date.now() && s.absoluteExpiresAt > Date.now())
      .map(s => ({
        deviceInfo: s.deviceInfo,
        ipAddress: s.ipAddress,
        lastUsed: s.lastUsed,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        absoluteExpiresAt: s.absoluteExpiresAt,
        daysRemaining: Math.ceil((s.absoluteExpiresAt - Date.now()) / (24 * 60 * 60 * 1000)),
        isCurrent: currentHashed ? s.refreshToken === currentHashed : false
      }));
  }

  // ================= HIGH-RISK ACTION VERIFICATION =================
  // For Upwork-style: Verify password for sensitive actions
  async verifyPassword(userId, password) {
    const user = await User.findById(userId).select('+password');
    if (!user) return false;
    
    return user.comparePassword(password);
  }

  // For Upwork-style: Require recent authentication
  requireRecentAuth(accessToken) {
    if (!this.isRecentAuth(accessToken)) {
      throw new Error('reauthentication_required');
    }
    return true;
  }
}

export default new AuthService();