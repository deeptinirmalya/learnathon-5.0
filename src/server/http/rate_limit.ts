import { Redis } from 'ioredis';
import type { Context, Next } from 'hono';
import { HttpError } from './errors.ts';
import { getClientInfo } from '../auth/jwt.ts';

// ---------------------------------------------------------------------------
// 1️⃣ Lazy Redis Connection — initialized on first request so that .env is
//    fully loaded before we read REDIS_URL from process.env
// ---------------------------------------------------------------------------
let redisClient: Redis | null = null;
let redisInitialized = false;

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

function getRedisClient(): Redis | null {
	if (redisInitialized) return redisClient;
	redisInitialized = true;

	// Read REDIS_URL from process.env at first-use time (after .env is loaded)
	const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
	try {
		redisClient = new Redis(redisUrl, {
			connectTimeout: 10000,
			commandTimeout: 5000,
			maxRetriesPerRequest: 1,
			retryStrategy() {
				return null; // Don't auto-reconnect endlessly
			}
		});
		redisClient.on('error', (err) => {
			console.error(`⚠️ Rate-limiter: Redis connection error – ${err.message}`);
		});
		redisClient.defineCommand('rateLimit', {
			numberOfKeys: 1,
			lua: LUA_SCRIPT
		});
	} catch (exc) {
		console.error(`⚠️ Rate-limiter: Redis initialization failed – ${exc}`);
		redisClient = null;
	}
	return redisClient;
}

// ---------------------------------------------------------------------------
// 2️⃣ In-memory fallback rate limiter (activates when Redis is unavailable)
// ---------------------------------------------------------------------------
interface MemoryBucket {
	tokens: number;
	timestamp: number;
}

const memoryBuckets = new Map<string, MemoryBucket>();

// Periodically clean expired entries to prevent memory leak
setInterval(() => {
	const now = Math.floor(Date.now() / 1000);
	for (const [key, bucket] of memoryBuckets) {
		// Remove entries idle for more than 5 minutes
		if (now - bucket.timestamp > 300) {
			memoryBuckets.delete(key);
		}
	}
}, 60_000).unref(); // unref so it doesn't keep the process alive

/** Clear all in-memory rate-limit state. Useful for test isolation. */
export function resetMemoryBuckets(): void {
	memoryBuckets.clear();
}

function memoryRateLimit(key: string, maxTokens: number, refillRate: number): boolean {
	const now = Math.floor(Date.now() / 1000);
	let bucket = memoryBuckets.get(key);

	if (!bucket) {
		bucket = { tokens: maxTokens, timestamp: now };
		memoryBuckets.set(key, bucket);
	}

	const delta = Math.max(0, now - bucket.timestamp);
	const refill = delta * refillRate;
	bucket.tokens = Math.min(maxTokens, bucket.tokens + refill);
	bucket.timestamp = now;

	if (bucket.tokens < 1) {
		return false; // blocked
	}

	bucket.tokens -= 1;
	return true; // allowed
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

		const redis = getRedisClient();

		for (const key of keys) {
			if (redis) {
				try {
					// We registered 'rateLimit' above, which executes the Lua script
					// @ts-ignore - custom command added via defineCommand
					const result = await redis.rateLimit(key, maxTokens, refillRate, now) as [number, string];
					const allowed = result[0];

					if (allowed === 0) {
						if (onBlock) {
							await onBlock(c, key);
						}
						throw new HttpError(429, 'too_many_requests', 'Too many requests – please try again later.');
					}
				} catch (exc) {
					if (exc instanceof HttpError) throw exc; // Re-throw our own 429
					
					console.warn(`⚠️ Redis error in rate limiter for ${key}: ${exc}`);
					console.warn('⚠️ Falling back to in-memory rate limiter.');
					// Fall through to memory limiter
					if (!memoryRateLimit(key, maxTokens, refillRate)) {
						if (onBlock) {
							await onBlock(c, key);
						}
						throw new HttpError(429, 'too_many_requests', 'Too many requests – please try again later.');
					}
					break;
				}
			} else {
				// Redis unavailable — use in-memory fallback (fail-closed)
				if (!memoryRateLimit(key, maxTokens, refillRate)) {
					if (onBlock) {
						await onBlock(c, key);
					}
					throw new HttpError(429, 'too_many_requests', 'Too many requests – please try again later.');
				}
			}
		}

		// Proceed to next middleware/handler if all limits passed
		await next();
	};
}
