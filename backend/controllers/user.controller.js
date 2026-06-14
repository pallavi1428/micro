import { User } from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { registerUserSchema } from "../validations/auth.validation.js";
import jwt from "jsonwebtoken";


//We wrap fn or controller in asyncHandler.
// you don't need a try/catch block! If any database line crashes, 
// it will automatically catch it and pass it to your error middleware via next(err).
//If MongoDB unexpectedly goes down while trying to process the logout, 
// asyncHandler catches the promise rejection and forwards it safely to your central error middleware instead of crashing backend.

// ========== HELPER FUNCTION ==========
const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found for token generation");
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(500, "Token generation failed: " + error.message);
  }
};

// ========== REGISTER USER ==========
export const registerUser = asyncHandler(async (req, res) => {
  // 1. Validate using Zod schema
  const validationResult = registerUserSchema.safeParse(req.body);
  
  if (!validationResult.success) {
    const formattedErrors = validationResult.error.issues.map(
      (err) => err.message
    );
    throw new ApiError(400, "Validation failed", formattedErrors);
  }

  const { email, fullName, password } = validationResult.data;
  const { userName, phoneNumber } = req.body;

  // 2. Check existing user
  const existingUser = await User.findOne({ 
    $or: [{ email }, { userName }] 
  });
  
  if (existingUser) {
    throw new ApiError(400, "User with this email or username already exists");
  }

  // 3. Generate unique username if not provided
  let finalUserName = userName;
  if (!finalUserName) {
    const baseUsername = fullName
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9]/g, "");

    finalUserName = baseUsername;
    let counter = 1;

    while (await User.findOne({ userName: finalUserName })) {
      finalUserName = `${baseUsername}${counter++}`;
    }
  }

  // 4. Create user
  const newUser = await User.create({
    fullName,
    email,
    password,
    userName: finalUserName.toLowerCase(),
    phoneNumber: phoneNumber || "",
    authProvider: "local",
  });

  const createdUser = await User.findById(newUser._id).select("-password -refreshToken -tokenVersion");
  if (!createdUser) {
    throw new ApiError(500, "User registration failed");
  }

  // 5. Generate tokens and auto-login
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(newUser._id);

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  };

  return res
    .status(201)
    .cookie("accessToken", accessToken, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000,
    })
    .cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json(
      new ApiResponse(
        201,
        { user: createdUser, accessToken },
        "User registered and logged in successfully"
      )
    );
});

// ========== LOGIN USER ==========
export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    throw new ApiError(404, "User not found. Please register first.");
  }

  if (user.authProvider !== "local") {
    throw new ApiError(
      401,
      `This account uses ${user.authProvider} login. Please use that method.`
    );
  }

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

  await user.updateLastLogin();

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

  const loggedInUser = await User.findById(user._id).select("-password -refreshToken -tokenVersion");

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000,
    })
    .cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken },
        "Login successful"
      )
    );
});

// ========== LOGOUT USER ==========
export const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    { $unset: { refreshToken: 1 } },
    { new: true }
  );

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  };

  return res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200, {}, "Logged out successfully"));
});

// ========== REFRESH TOKEN ==========
export const refreshAccessToken = asyncHandler(async (req, res) => {
  //1. System search for refreshtoken (sent by client)in either secure browser cookies or in JSON body data
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Refresh token required");
  }
//2. invoke jwt.verify to verifu if refreshtoken wasn't tampered, if nice then 
// decoded token is returned which has data with id etc.
//JWT, check whether this token was created by me and hasn't been tampered with.
//jwt.verify() does not fetch the user from the database. It only tells you what user ID is written inside the token.
  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET
    );
//If valid decodedtoken, it'll return {_id} ,etc which user this token claims to belong to.
//Find that user and select +refreshToken to compare it later 
    const user = await User.findById(decodedToken._id).select("+refreshToken");
    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401, "Refresh token has been used or expired");
    }

    if (decodedToken.tokenVersion !== user.tokenVersion) {
      throw new ApiError(401, "Token version mismatch. Please login again.");
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    };

    return res
      .status(200)
      .cookie("accessToken", accessToken, {
        ...cookieOptions,
        maxAge: 24 * 60 * 60 * 1000,
      })
      .cookie("refreshToken", newRefreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .json(new ApiResponse(200, { accessToken }, "Token refreshed successfully"));
  } catch (error) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }
});

// ========== GET CURRENT USER ==========
export const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password -refreshToken -tokenVersion");
//grabs the logged-in user's identity instantly from the request object
//getUserById reads a specific string from the raw URL path variable context (e.g., /api/users/64f1a...)
// Find the currently logged-in user using their ID removing sensitive details from req.user
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { user }, "User details fetched successfully"));
});

// ========== GET ALL USERS ==========
export const getAllUsers = asyncHandler(async (req, res) => {
  //Get pagination values from the URL page=2 requested/ user per page/users to skip
  const page = parseInt(req.query.page) || 1; //Reads the target page from the URL query string
  const limit = parseInt(req.query.limit) || 10; //no. of user profiles to show per page
  const skip = (page - 1) * limit; //formula for database skipping,  If you are on Page 1, you skip 0 users. 
  // If you are on Page 2 with a limit of 10, you skip the first 10 users to display numbers 11 through 20.

  const { search } = req.query; //Check whether the frontend sent a search term., 
  // Extracts a search term from the URL query string (e.g., /api/users?search=alex).
  let filter = {}; //initialise empty filter
  //empty {} which tells MongoDB: "Fetch all users unconditionally."

  if (search) { //if search exist, find matches where the query phrase hits either the fullName, email, or userName.
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { userName: { $regex: search, $options: 'i' } }
    ];
  }

  const [users, totalUsers] = await Promise.all([
    User.find(filter)
      .select("-password -refreshToken -tokenVersion")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(totalUsers / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        users,
        pagination: {
          currentPage: page,
          totalPages,
          totalUsers,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      },
      "Users fetched successfully"
    )
  );
});

// ========== GET USER BY ID ==========
export const getUserById = asyncHandler(async (req, res) => {
  //req.params has values coming from url parameter eg. 
  //extracts the user ID from the URL so MongoDB knows which user document to fetch.
  //router.get("/:userId", getUserById); --> {userId:"123"}
  const { userId } = req.params; 

  const user = await User.findById(userId).select("-password -refreshToken -tokenVersion");
//searches MongoDB for the user whose _id matches the value from the URL.
//removes sensitive fields before sending data to the frontend.
  if (!user) {//if user===null throw error (no matching documents)
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(
    new ApiResponse(200, { user }, "User fetched successfully")
  );
});

// ========== UPDATE USER PROFILE ==========
export const updateUserProfile = asyncHandler(async (req, res) => {
  //read incoming profile fields from the request body.
  const { fullName, userName, bio, phoneNumber, avatar } = req.body;
//updateData starts as an empty object.
//This object will later contain only fields the user actually wants to change.
  const updateData = {};

  //only update fields that actually exist
  if (fullName) updateData.fullName = fullName;
  if (bio) updateData.bio = bio;
  if (phoneNumber) updateData.phoneNumber = phoneNumber;
  if (avatar) updateData.avatar = avatar;

  if (userName) { ///check whether somebody else already owns it.
    const existingUser = await User.findOne({ //first check whether somebody else already owns it.
      userName: userName.toLowerCase(), 
      _id: { $ne: req.user._id }, //Find users whose ID is NOT my ID. 
      // $ne not equal
    });

    if (existingUser) {
      throw new ApiError(409, "Username already taken");
    }
    updateData.userName = userName.toLowerCase(); //else update username
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id, //req.user._id comes from JWT middleware. Update the currently logged-in user's profile.
    { $set: updateData }, //Replace only the specified fields.
    { new: true, runValidators: true } //findByIdAndUpdate() will return old data without new:true
  ).select("-password -refreshToken -tokenVersion");

  return res
    .status(200)
    .json(new ApiResponse(200, { user: updatedUser }, "Profile updated successfully"));
});

// ========== DELETE USER ==========
export const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const deletedUser = await User.findByIdAndDelete(userId);

  if (!deletedUser) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(
    new ApiResponse(200, {}, "User deleted successfully")
  );
});

// ========== CHANGE PASSWORD ==========
export const changeUserPassword = asyncHandler(async (req, res) => {
  //read incoming fields from the request body.
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    throw new ApiError(400, "Old password and new password are required");
  }
//Uses the user ID attached by the JWT middleware to retrieve the currently logged-in account.
//Overrides the schema's hidden-password protection and temporarily includes the hashed password field because password verification cannot happen without access to the stored hash.
  const user = await User.findById(req.user._id).select("+password");
  if (!user) {
    throw new ApiError(404, "User not found");
  }
//check if google loginned
//Does this user have a password stored in the database?
  if (!user.password) {
    throw new ApiError(400, "This account uses Google login. No password to change.");
  }
//Uses bcrypt comparison logic through the model method to ensure current password matches encrypted password stored in MongoDB.
  const isPasswordValid = await user.isPasswordCorrect(oldPassword);
  if (!isPasswordValid) {
    throw new ApiError(401, "Old password is incorrect");
  }

  user.password = newPassword; //Updates the password field with the new value and saves the document.
  //During save, the schema's pre-save middleware runs and hashes the new password before it reaches MongoDB
  await user.save({ validateBeforeSave: true });
//Sends a successful response back
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully. Please login again."));
});

// ========== GOOGLE AUTH CALLBACK ==========
export const googleAuthCallback = asyncHandler(async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect(`${process.env.CLIENT_URL}/login?error=google_auth_failed`);
        }

        // Generate JWT tokens for the Google-authenticated user
        const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(req.user._id);

        // Set cookies
//Defines the security rules that will be applied to every authentication cookie created in the next step.
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
        };
//instruct browser to create & store both jwt cookies
        res.cookie("accessToken", accessToken, {
            ...cookieOptions,
            maxAge: 24 * 60 * 60 * 1000,
        });
        
        res.cookie("refreshToken", refreshToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        // Redirect to frontend dashboard
//once the browser receives-stores the authentication cookies, 
// the user is redirected into the protected area of the application.
        return res.redirect(`${process.env.CLIENT_URL}/dashboard`);
    } catch (error) {
        console.error("Google callback error:", error);
        return res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
    }
});