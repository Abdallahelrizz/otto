import { Redis } from 'ioredis';

let defaultRedis = null;
function getDefaultRedis() {
  if (!defaultRedis) {
    defaultRedis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return defaultRedis;
}

export async function redisGet({ config, credential }) {
  const { key } = config;
  if (!key) throw new Error('Redis Get: key is required');

  const client = credential?.data?.url
    ? new Redis(credential.data.url, { maxRetriesPerRequest: 3 })
    : getDefaultRedis();

  const value = await client.get(String(key));
  return { key, value, found: value !== null };
}
