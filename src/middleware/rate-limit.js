const store = new Map();

function nowMs() {
  return Date.now();
}

export function checkRateLimit(key, { limit, windowMs }) {
  const current = nowMs();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= current) {
    store.set(key, { count: 1, resetAt: current + windowMs });
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

// Per-user API rate limit: 1000 requests per minute (generous for normal use)
const USER_API_LIMIT = { limit: Number(process.env.API_RATE_LIMIT ?? 1000), windowMs: 60_000 };

// Per-workspace execution rate limit: 100 executions per minute
const WORKSPACE_EXEC_LIMIT = { limit: Number(process.env.EXEC_RATE_LIMIT ?? 100), windowMs: 60_000 };

export function checkUserApiLimit(userId) {
  return checkRateLimit(`user-api:${userId}`, USER_API_LIMIT);
}

export function checkWorkspaceExecLimit(workspaceId) {
  return checkRateLimit(`ws-exec:${workspaceId}`, WORKSPACE_EXEC_LIMIT);
}

// Clean up expired windows every 5 minutes to prevent memory growth
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) store.delete(key);
    }
  }, 5 * 60_000).unref();
}
