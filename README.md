# Complete Express + React + Vite Starter Template

## 📁 Final Project Structure

```
project-root/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── db/
│   │   │   └── index.js
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.js
│   │   │   └── multer.middleware.js
│   │   ├── models/
│   │   ├── routes/
│   │   ├── utils/
│   │   │   ├── ApiError.js
│   │   │   ├── ApiResponse.js
│   │   │   ├── asyncHandler.js
│   │   │   └── cloudinary.js
│   │   └── app.js
│   ├── index.js
│   ├── package.json
│   └── .env
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
├── .gitignore
└── README.md
```

## 🚀 Initial Setup

### Backend Setup

```bash
# Create project directory
mkdir my-app
cd my-app

# Create backend folder
mkdir backend
cd backend

# Initialize npm
npm init -y

# Install dependencies
npm install express mongoose dotenv cors cookie-parser
npm install cloudinary multer
npm install --save-dev nodemon prettier

# Create folder structure
mkdir src
cd src
mkdir controllers db middlewares models routes utils
cd ..
```

### Frontend Setup

```bash
# In root directory (my-app/)
npm create vite@latest frontend -- --template react
cd frontend
npm install
```

## 📝 Backend Files

### 1. `backend/.env`
```env
PORT=8000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
CORS_ORIGIN=http://localhost:5173

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
SESSION_SECRET=your_session_secret
```

### 2. `backend/package.json`
```json
{
  "name": "backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "mongoose": "^8.0.0",
    "cloudinary": "^1.41.0",
    "multer": "^1.4.5-lts.1",
    "passport": "^0.7.0",
    "passport-google-oauth20": "^2.0.0",
    "express-session": "^1.17.3"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "prettier": "^3.0.3"
  }
}
```

### 3. `backend/src/db/index.js`
```javascript
import mongoose from "mongoose";

const connectDB = async () => {
    try {
        const connectionInstance = await mongoose.connect(process.env.MONGODB_URI);
        console.log(`\n✅ MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`);
    } catch (error) {
        console.log("❌ MONGODB connection FAILED: ", error);
        process.exit(1);
    }
};

export default connectDB;
```

### 4. `backend/index.js`
```javascript
import dotenv from "dotenv";
import connectDB from "./src/db/index.js";
import { app } from "./src/app.js";

dotenv.config({
    path: './.env'
});

connectDB()
    .then(() => {
        app.listen(process.env.PORT || 8000, () => {
            console.log(`⚙️ Server is running at port: ${process.env.PORT || 8000}`);
        });
    })
    .catch((err) => {
        console.log("❌ MONGO db connection failed: ", err);
    });
```

### 5. `backend/src/app.js`
```javascript
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "passport";

const app = express();

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
}));

// Common middleware
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// Session configuration for Google OAuth
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // set to true if using https
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Import routes (you'll create these later)
// import userRouter from './routes/user.routes.js';
// app.use("/api/v1/users", userRouter);

export { app };
```

### 6. `backend/src/utils/asyncHandler.js`
```javascript
const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
    };
};

export { asyncHandler };
```

### 7. `backend/src/utils/ApiError.js`
```javascript
class ApiError extends Error {
    constructor(
        statusCode,
        message = "Something went wrong",
        errors = [],
        stack = ""
    ) {
        super(message);
        this.statusCode = statusCode;
        this.data = null;
        this.message = message;
        this.success = false;
        this.errors = errors;

        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export { ApiError };
```

### 8. `backend/src/utils/ApiResponse.js`
```javascript
class ApiResponse {
    constructor(statusCode, data, message = "Success") {
        this.statusCode = statusCode;
        this.data = data;
        this.message = message;
        this.success = statusCode < 400;
    }
}

export { ApiResponse };
```

### 9. `backend/src/utils/cloudinary.js`
```javascript
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null;

        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        });

        fs.unlinkSync(localFilePath);
        return response;

    } catch (error) {
        fs.unlinkSync(localFilePath);
        return null;
    }
};

export { uploadOnCloudinary };
```

### 10. `backend/src/middlewares/multer.middleware.js`
```javascript
import multer from "multer";

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "./public/temp");
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

export const upload = multer({
    storage,
});
```

### 11. Google Auth Configuration (Optional)

#### `backend/src/middlewares/auth.middleware.js`
```javascript
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { User } from "../models/user.model.js";

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/v1/users/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        
        if (!user) {
            user = await User.create({
                googleId: profile.id,
                name: profile.displayName,
                email: profile.emails[0].value,
                avatar: profile.photos[0].value
            });
        }
        
        return done(null, user);
    } catch (error) {
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

export const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    throw new ApiError(401, "Unauthorized access");
};
```

## 🔧 Prettier Configuration

### `backend/.prettierrc`
```json
{
    "singleQuote": true,
    "bracketSpacing": true,
    "tabWidth": 2,
    "trailingComma": "es5",
    "semi": true
}
```

## 📄 Root Files

### Root `README.md`
2. **Backend Setup**
```bash
cd backend
npm install
cp .env.example .env
# Update .env with your credentials
npm run dev
```

3. **Frontend Setup**
```bash
cd frontend
npm install
npm run dev
```

## 📁 Project Structure

```
├── backend/                # Express backend
│   ├── src/
│   │   ├── controllers/    # Route controllers
│   │   ├── db/            # Database connection
│   │   ├── middlewares/    # Custom middlewares
│   │   ├── models/        # Mongoose models
│   │   ├── routes/         # Express routes
│   │   ├── utils/          # Utility functions
│   │   └── app.js         # Express app setup
│   ├── index.js            # Server entry point
│   └── .env                # Environment variables
├── frontend/               # React + Vite frontend
│   ├── src/
│   ├── public/
│   └── vite.config.js
└── README.md
```

## 🔧 Environment Variables

### Backend (.env)
```env
PORT=8000
MONGODB_URI=your_mongodb_uri
CORS_ORIGIN=http://localhost:5173
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## 🚦 Running the Application

### Development Mode
```bash
# Backend (from backend directory)
npm run dev

# Frontend (from frontend directory)
npm run dev
```

### Production Build
```bash
# Frontend build
cd frontend
npm run build

# Backend start
cd backend
npm start
```

## 🔐 Features Included

- ✅ MongoDB connection with Mongoose
- ✅ Express server setup
- ✅ CORS configuration
- ✅ Cookie parser middleware
- ✅ File upload with Multer
- ✅ Cloudinary integration
- ✅ Async handler wrapper
- ✅ Standardized API responses
- ✅ Error handling classes
- ✅ Environment configuration
- ✅ Prettier code formatting
- ✅ Google OAuth ready (optional)

## 🛠️ Adding Google OAuth

1. Uncomment Google OAuth code in `app.js` and `auth.middleware.js`
2. Create a User model
3. Add Google OAuth routes
4. Configure Google Cloud Console credentials
