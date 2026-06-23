import type { RequestHandler } from 'express';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  message?: string;
};

type Counter = {
  count: number;
  resetAt: number;
};

export function createRateLimit(options: RateLimitOptions): RequestHandler {
  const counters = new Map<string, Counter>();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const current = counters.get(key);

    if (!current || current.resetAt <= now) {
      counters.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: options.message || 'Too many requests. Please try again shortly.' });
      return;
    }

    next();
  };
}

export const authRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 20,
  message: 'Too many sign-in attempts. Please wait a minute.',
});

export const aiRateLimit = createRateLimit({
  windowMs: 10 * 60_000,
  max: 40,
  message: 'The realm is catching its breath. Please try again in a few minutes.',
});
