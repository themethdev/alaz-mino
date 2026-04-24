import { createClient } from "redis";
const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";

export const pubClient = createClient({
  url
});

export const subClient = pubClient.duplicate();

await pubClient.connect();
await subClient.connect();