import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // required by BullMQ
});

// Surface connection failures instead of letting commands silently queue/hang.
let _redisErrorLogged = false;
redis.on('error', (err) => {
  // Throttle: ioredis emits on every retry. Log first occurrence + transitions.
  if (!_redisErrorLogged) {
    _redisErrorLogged = true;
    console.error(`[redis] connection error: ${err.message}`);
  }
});
redis.on('ready', () => {
  if (_redisErrorLogged) console.log('[redis] reconnected');
  _redisErrorLogged = false;
});

export const executionQueue = new Queue('executions', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
});
