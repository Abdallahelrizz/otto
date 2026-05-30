import { Redis } from 'ioredis';
import { assertSafeConnectionTarget } from '../utils/safe-fetch.js';

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

  if (credential?.data?.url) await assertSafeConnectionTarget(credential.data.url);
  const client = credential?.data?.url
    ? new Redis(credential.data.url, { maxRetriesPerRequest: 3 })
    : getDefaultRedis();

  const value = await client.get(String(key));
  return { key, value, found: value !== null };
}
