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
db/index.js , no need of constant.js,
index.js (import connectDB)
app.js with express method exported
db connected 

# Cors
npm i cors set cookie-parser (cookie-parser, cors)
1. update app.js with both and setting for urlencoder, cookieparser,etc.
2. backend\utils\asyncHandler.js (wrapper function)
``const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err))
    }
}

export { asyncHandler }``

3. backend\utils\ApiError.js ()

``class ApiError extends Error {
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

export {ApiError}``

4. backend\utils\ApiResponse.js (response will be send through the classes here)
``class ApiResponse {
    constructor(statusCode, data, message = "Success"){
        this.statusCode = statusCode
        this.data = data
        this.message = message
        this.success = statusCode < 400
    }
}

export { ApiResponse }``