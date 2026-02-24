# React + Vite
npm create vite@latest --> delete additionals and add backend with npm init +index.js

npm init--install express
--add index.js with express script 
--app.js,constants.js(not required if using atlas not local), 
install nodemon

# Folder Structure
$ mkdir controllers db middlewares models routes utils

# Prettier
npm i -D prettier
connect DB--create constant -add MONGO_URI in .env

# MONGODB CONNECT 
$ npm i mongoose express dotenv 
1. db/index.js , no need of constant.js,

``import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";


const connectDB = async () => {
    try {
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}`)
        console.log(`\n MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`);
    } catch (error) {
        console.log("MONGODB connection FAILED ", error);
        process.exit(1)
    }
}

export default connectDB``

2. index.js (import connectDB)
```import dotenv from "dotenv"
import connectDB from "./db/index.js";
import {app} from './app.js'
dotenv.config({
    path: './.env'
})



connectDB()
.then(() => {
    app.listen(process.env.PORT || 8000, () => {
        console.log(`⚙️ Server is running at port : ${process.env.PORT}`);
    })
})
.catch((err) => {
    console.log("MONGO db connection failed !!! ", err);
})```

3. app.js with express method exported
```import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"

const app = express()

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}))

app.use(express.json({limit: "16kb"}))
app.use(express.urlencoded({extended: true, limit: "16kb"}))
app.use(express.static("public"))
app.use(cookieParser())

export { app }```
db connected 


# Cors
npm i cors set cookie-parser (cookie-parser, cors)
1. update app.js with both and setting for urlencoder, cookieparser,etc.
2. backend\utils\asyncHandler.js (wrapper function)
```const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err))
    }
}

export { asyncHandler }```

3. backend\utils\ApiError.js ()

```class ApiError extends Error {
    constructor(
        statusCode,
        message= "Something went wrong",
        errors = [],
        stack = ""
    ){
        super(message)
        this.statusCode = statusCode
        this.data = null
        this.message = message
        this.success = false;
        this.errors = errors

        if (stack) {
            this.stack = stack
        } else{
            Error.captureStackTrace(this, this.constructor)
        }

    }
}

export {ApiError}```

4. backend\utils\ApiResponse.js (response will be send through the classes here)
```class ApiResponse {
    constructor(statusCode, data, message = "Success"){
        this.statusCode = statusCode
        this.data = data
        this.message = message
        this.success = statusCode < 400
    }
}

export { ApiResponse }```


# CLOUDINARY AND MULTER
1. backend\utils\cloudinary.js
```import {v2 as cloudinary} from "cloudinary"
import fs from "fs"


cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null
        //upload the file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        })
        // file has been uploaded successfull
        //console.log("file is uploaded on cloudinary ", response.url);
        fs.unlinkSync(localFilePath)
        return response;

    } catch (error) {
        fs.unlinkSync(localFilePath) // remove the locally saved temporary file as the upload operation got failed
        return null;
    }
}



export {uploadOnCloudinary}```

2. multer middleware (backend\middlewares\multer.middleware.js) diskstorage

```import multer from "multer";

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "./public/temp")
    },
    filename: function (req, file, cb) {
      
      cb(null, file.originalname)
    }
  })
  
export const upload = multer({ 
    storage, 
})```
backend\models\user.model.js--create a schema
backend\controllers\user.controller.js
in registerNewUserAccount function: 
1. /register (registerNewUserAccount)=> asyncHandler(.js), sanitize body(npm i mongo-sanitize), validate using zod(registerUserSchema in auth.validation.js)  
ApiError(name, email,.js)
2. check existingUser
3. GenerateUniqueUsername
4. create user and send response of error(ApiError.js)

``import { User } from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { registerUserSchema } from "../validations/auth.validation.js";
import sanitize from "mongo-sanitize";

/**
 * @desc    Register a new user account
 * @route   POST /api/v1/auth/register
 * @access  Public
 */

export const registerNewUserAccount = asyncHandler(async (req, res) => {
  // console.log("HEADERS:", req.headers);
  // console.log("BODY:", req.body);
  // 1️⃣ Sanitize Request Body (mutates req.body)
  sanitize(req.body);
  const { fullname } = req.body;

  if (!fullname) {
    throw new ApiError(400, "Full name is required");
  }

  // 2️⃣ Validate Only Email & Password Using Zod
  const validationResult = registerUserSchema.safeParse(req.body);

  if (!validationResult.success) {
    const formattedErrors = validationResult.error.issues.map(
      (err) => err.message
    );

    throw new ApiError(400, "Validation failed", formattedErrors);
  }

  const { email, password } = validationResult.data;

  // 3️⃣ Check Existing Email
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new ApiError(
      409,
      "An account with this email address already exists. Please log in instead."
    );
  }

  // 4️⃣ Generate Unique Username
  const baseUsername = fullname
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");

  let generatedUsername = baseUsername;
  let counter = 1;

  while (await User.findOne({ userName: generatedUsername })) {
    generatedUsername = `${baseUsername}${counter++}`;
  }

  // 5️⃣ Create User
  const newUser = await User.create({
    fullname,
    email,
    password,
    userName: generatedUsername,
  });

  // 6️⃣ Send Response
  return res.status(201).json(
    new ApiResponse(
      201,
      {
        id: newUser._id,
        fullname: newUser.fullname,
        email: newUser.email,
        userName: newUser.userName,
      },
      "Your account has been successfully created. You may now log in."
    )
  );
});``

D:\micro_13\backend\routes\auth.routes.js
``import express from "express";
import { registerNewUserAccount } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
const router = express.Router();
router.post("/register", registerNewUserAccount);
export default router;``'

D:\micro_13\backend\app.js
import authRoutes from "./routes/auth.routes.js";
app.use("/api/v1/auth", authRoutes);



#GOOGLE AUTH
[text](https://github.com/raj21parihar/express-auth-starter-template)
