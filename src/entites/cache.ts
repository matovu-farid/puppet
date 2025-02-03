import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export const setCache = async (key: string, value: string) => {
  await redis.set(key, value);
}

export const getCache = async (key: string) => {
  const data = await redis.get(key);
  return JSON.parse(data as string);
}