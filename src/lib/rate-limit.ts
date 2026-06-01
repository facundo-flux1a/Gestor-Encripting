import { redis } from './redis';

/**
 * Checks if a user has exceeded their rate limit.
 * Uses a simple fixed window counter in Redis.
 *
 * @param identifier The unique identifier for the limit (e.g. `user_id`)
 * @param limit The maximum number of requests allowed in the window
 * @param windowSeconds The duration of the window in seconds
 * @param prefix Redis key prefix
 * @returns Object indicating if the request is allowed, and the remaining requests
 */
export async function checkRateLimit(
  identifier: string | number,
  limit: number,
  windowSeconds: number,
  prefix: string = 'rate_limit:playground'
): Promise<{ success: boolean; remaining: number }> {
  const key = `${prefix}:${identifier}`;
  
  try {
    // Increment the counter
    const current = await redis.incr(key);
    
    // If it's the first request in the window, set the expiration
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    
    // Check if the limit has been exceeded
    if (current > limit) {
      return { success: false, remaining: 0 };
    }
    
    return { success: true, remaining: limit - current };
  } catch (error) {
    console.error('❌ [RateLimit] Error checking rate limit:', error);
    // On Redis failure, fail-open (allow request) to prevent blocking legitimate users due to infra issues
    return { success: true, remaining: 1 };
  }
}
