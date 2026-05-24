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

export async function redisSet({ config, credential }) {
  const { key, value, ttl } = config;
  if (!key) throw new Error('Redis Set: key is required');

  const client = credential?.data?.url
    ? new Redis(credential.data.url, { maxRetriesPerRequest: 3 })
    : getDefaultRedis();

  const ttlSeconds = ttl ? Number(ttl) : null;
  if (ttlSeconds && ttlSeconds > 0) {
    await client.set(String(key), String(value ?? ''), 'EX', ttlSeconds);
  } else {
    await client.set(String(key), String(value ?? ''));
  }

  return { key, ok: true };
}
