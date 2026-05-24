const buckets = new Map();

function nowMs() {
  return Date.now();
}

export function checkRateLimit(key, { limit, windowMs }) {
  const current = nowMs();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= current) {
    buckets.set(key, { count: 1, resetAt: current + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: current + windowMs };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

export function rateLimitReply(reply, result) {
  reply.header('Retry-After', String(Math.ceil((result.resetAt - nowMs()) / 1000)));
  return reply.code(429).send({ error: 'Too many requests' });
}
