import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
    try {
        // Get token from cookie or Authorization header
        const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");
        
        if (!token) {
            throw new ApiError(401, "Access token not found, unauthorized access");
        }

        // Verify token
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET);

        // Find user
        const user = await User.findById(decodedToken._id).select("-password -refreshToken");
        
        if (!user) {
            throw new ApiError(401, "Invalid token, user not found");
        }

        // Optional: Check token version (comment this out if causing issues)
        // if (decodedToken.tokenVersion !== user.tokenVersion) {
        //     throw new ApiError(401, "Token expired. Please login again");
        // }

        // Attach user to request
        req.user = user;
        
        next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            throw new ApiError(401, "Invalid or expired token");
        }
        throw new ApiError(401, error.message || "Unauthorized access");
    }
});