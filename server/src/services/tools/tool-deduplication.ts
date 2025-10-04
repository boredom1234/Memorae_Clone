import { logInfo, logError } from "../../utils/logger";

/**
 * Tool Deduplication Module
 * Provides caching and deduplication for tool executions
 */

/**
 * Creates a deduplication wrapper for tool executions
 * Prevents duplicate tool calls within the same request
 */
export function createDeduplicationWrapper() {
  // Per-request de-duplication for identical tool calls
  const resultCache = new Map<string, any>();
  const pendingCache = new Map<string, Promise<any>>();

  // Per-request execution stats
  const stats: any = {
    executed: false,
    names: [] as string[],
    counts: {} as Record<string, number>,
  };

  /**
   * Normalize values for consistent cache keys
   */
  const normalize = (value: any): any => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      const out: any = {};
      for (const k of Object.keys(value).sort()) out[k] = normalize(value[k]);
      return out;
    }
    return value;
  };

  /**
   * Canonicalize parameters for cache key generation
   * Special handling for createReminder to normalize similar requests
   */
  const canonicalizeForKey = (name: string, params: any) => {
    const p = normalize(params || {});
    try {
      if (name === "createReminder" && p) {
        if (typeof p.title === "string") {
          p.title = p.title.trim().toLowerCase();
        }
        if (p.reminderTime) {
          const d = new Date(p.reminderTime);
          if (!isNaN(d.getTime())) {
            const bucket = Math.floor(d.getTime() / 60000) * 60000; // floor to minute
            p.reminderTime = new Date(bucket).toISOString();
          }
        }
      }
    } catch {}
    return p;
  };

  /**
   * Build cache key from tool name and parameters
   */
  const buildKey = (name: string, params: any) =>
    `${name}:${JSON.stringify(canonicalizeForKey(name, params))}`;

  /**
   * Deduplicate function wrapper
   */
  const dedupe = <T>(name: string, fn: (params: any) => Promise<T>) => {
    return async (params: any): Promise<T> => {
      const key = buildKey(name, params);

      // Mark stats on attempt; concrete execution may reuse cached
      stats.executed = true;
      stats.names.push(name);
      stats.counts[name] = (stats.counts[name] || 0) + 1;

      if (resultCache.has(key)) {
        logInfo(`Dedup hit for tool: ${name}`);
        return resultCache.get(key) as T;
      }

      if (pendingCache.has(key)) {
        logInfo(`Dedup pending hit for tool: ${name}`);
        return (await pendingCache.get(key)!) as T;
      }

      const p = (async () => {
        try {
          const res = await fn(params);
          resultCache.set(key, res);
          return res;
        } catch (error: any) {
          // Return error as structured response so AI can see it
          const errorResponse = {
            success: false,
            error: true,
            message: error.message || "Operation failed",
            errorCode: error.code || "UNKNOWN_ERROR",
            details: error.statusCode
              ? `Status: ${error.statusCode}`
              : undefined,
          } as any;

          logError(`Tool ${name} failed`, error, { params });

          // Cache the error response to prevent retries
          resultCache.set(key, errorResponse);
          return errorResponse;
        } finally {
          pendingCache.delete(key);
        }
      })();

      pendingCache.set(key, p);
      return (await p) as T;
    };
  };

  return { dedupe, stats };
}
