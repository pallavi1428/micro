import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from "./app.js";
//import { connectRedis } from "./utils/redis.js";
import { User } from "./models/user.model.js";

dotenv.config({ path: "./.env" });

connectDB()
  .then(async () => {
    //await connectRedis();
    app.listen(process.env.PORT || 3000, () => {
        console.log(`⚙️ Server is running at port : ${process.env.PORT}`);
    })
})
.catch((err) => {
    console.log("MONGO db connection failed !!! ", err);
})
