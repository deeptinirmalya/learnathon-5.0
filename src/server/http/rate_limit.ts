import { Redis } from 'ioredis';
import type { Context, Next } from 'hono';
import { REDIS_URL } from '../config.ts';
import { HttpError } from './errors.ts';
import { getClientInfo } from '../auth/jwt.ts';

// ---------------------------------------------------------------------------
// 1️⃣ Redis Connection (fails fast if mis-configured)
// ---------------------------------------------------------------------------
let redisClient: Redis | null = null;
try {
	redisClient = new Redis(REDIS_URL, {
		connectTimeout: 1000,
		commandTimeout: 1000,
		maxRetriesPerRequest: 1,
		retryStrategy() {
			// Don't auto-reconnect endlessly on startup to prevent hanging
			return null; 
		}
	});

	redisClient.on('error', (err) => {
		console.error(`⚠️ Rate-limiter: Redis connection error – ${err.message}`);
	});
} catch (exc) {
	console.error(`⚠️ Rate-limiter: Redis initialization failed – ${exc}`);
}

// ---------------------------------------------------------------------------
// 2️⃣ Lua Script
// ---------------------------------------------------------------------------
const LUA_SCRIPT = `
local key = KEYS[1]
local max_tokens = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call("HMGET", key, "tokens", "timestamp")
local tokens = tonumber(data[1])
local last_time = tonumber(data[2])

if tokens == nil then
    tokens = max_tokens
    last_time = now
end

local delta = math.max(0, now - last_time)
local refill = delta * refill_rate
tokens = math.min(max_tokens, tokens + refill)

if tokens < 1 then
    return {0, tostring(tokens)}
end

tokens = tokens - 1
redis.call("HSET", key, "tokens", tokens, "timestamp", now)
redis.call("EXPIRE", key, 120)
return {1, tostring(tokens)}
`;

if (redisClient) {
	// Register the script so we can call it via EVALSHA for better performance
	redisClient.defineCommand('rateLimit', {
		numberOfKeys: 1,
		lua: LUA_SCRIPT
	});
}

// ---------------------------------------------------------------------------
// 3️⃣ Main Middleware Factory
// ---------------------------------------------------------------------------
interface RateLimiterOptions {
	maxTokens?: number;
	refillRate?: number;
	mode?: 'ip' | 'user' | 'both' | 'login';
	onBlock?: (c: Context, key: string) => Promise<void>;
}

export function rateLimiter(options: RateLimiterOptions = {}) {
	const { maxTokens = 10, refillRate = 1.0, mode = 'both', onBlock } = options;

	if (!['ip', 'user', 'both', 'login'].includes(mode)) {
		throw new Error(`Invalid mode="${mode}". Expected one of ip, user, both, login.`);
	}

	return async (c: Context, next: Next) => {
		if (!redisClient || redisClient.status !== 'ready') {
			console.error('Rate-limiter invoked while Redis is unavailable');
			throw new HttpError(
				503,
				'service_unavailable',
				'Rate-limiting service unavailable – please try again later'
			);
		}

		const now = Math.floor(Date.now() / 1000);
		const keys: string[] = [];

		const { ip } = getClientInfo(c);

		if (['ip', 'both', 'login'].includes(mode)) {
			keys.push(`rate:ip:${ip}`);
		}

		if (['user', 'both'].includes(mode)) {
			const user = c.get('user');
			const userId = user?.id;
			if (userId) {
				keys.push(`rate:user:${userId}`);
			}
		}

		if (mode === 'login' && c.req.method === 'POST') {
			keys.push(`rate:login_ip:${ip}`);
		}

		// Defensive fallback
		if (keys.length === 0) {
			keys.push(`rate:ip:${ip}`);
		}

		for (const key of keys) {
			try {
				// We registered 'rateLimit' above, which executes the Lua script
				// @ts-ignore - custom command added via defineCommand
				const result = await redisClient.rateLimit(key, maxTokens, refillRate, now) as [number, string];
				const allowed = result[0];

				if (allowed === 0) {
					if (onBlock) {
						await onBlock(c, key);
					}
					throw new HttpError(429, 'too_many_requests', 'Too many requests – please try again later.');
				}
			} catch (exc) {
				if (exc instanceof HttpError) throw exc; // Re-throw our own 429
				
				console.error(`Redis error in rate limiter for ${key}: ${exc}`);
				// Treat Redis errors as a hard block (fail-closed)
				throw new HttpError(
					503,
					'service_unavailable',
					'Rate-limiting backend error – please try again later'
				);
			}
		}

		// Proceed to next middleware/handler if all limits passed
		await next();
	};
}
