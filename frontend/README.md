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
