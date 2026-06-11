import { createClient } from "redis";

const redisURL = process.env.REDIS_URL;

if (!redisURL) {
  console.error("❌ REDIS_URL is missing in environment variables");
  process.exit(1);
}

export const redisClient = createClient({
  url: redisURL,
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error", err);
});

export const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log("✅ Redis connected successfully");
  } catch (error) {
    console.error("❌ Redis connection failed", error);
    process.exit(1);
  }
};