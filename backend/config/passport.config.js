import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { User } from "../models/user.model.js";

export const initializePassport = () => {
    passport.use(
        new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/api/v1/auth/google/callback",
                scope: ["profile", "email"],
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    console.log("Google Profile:", profile);
                    
                    // Check if user already exists with this googleId
                    let user = await User.findOne({ googleId: profile.id });
                    
                    if (user) {
                        // User exists, return them
                        return done(null, user);
                    }
                    
                    // Check if user exists with the same email
                    user = await User.findOne({ email: profile.emails[0].value });
                    
                    if (user) {
                        // User exists with email but no googleId - link the account
                        user.googleId = profile.id;
                        user.authProvider = "google";
                        await user.save();
                        return done(null, user);
                    }
                    
                    // Create new user
                    const baseUsername = profile.displayName
                        .toLowerCase()
                        .replace(/\s+/g, "")
                        .replace(/[^a-z0-9]/g, "");
                    
                    let userName = baseUsername;
                    let counter = 1;
                    
                    while (await User.findOne({ userName })) {
                        userName = `${baseUsername}${counter++}`;
                    }
                    
                    // Create new user with Google account
                    const newUser = await User.create({
                        email: profile.emails[0].value,
                        fullName: profile.displayName,
                        userName: userName,
                        googleId: profile.id,
                        authProvider: "google",
                        avatar: profile.photos?.[0]?.value || "",
                        emailVerified: true, // Google emails are verified
                        accountVerified: true,
                    });
                    
                    return done(null, newUser);
                } catch (error) {
                    console.error("Google Strategy Error:", error);
                    return done(error, null);
                }
            }
        )
    );
    
    // Serialize user for session
    passport.serializeUser((user, done) => {
        done(null, user._id);
    });
    
    // Deserialize user from session
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (error) {
            done(error, null);
        }
    });
};

export default initializePassport;