import { logInfo, logError } from "../../utils/logger";
export function createDeduplicationWrapper(context?: {
  originalMessage?: string;
  timezone?: string;
}) {
  const resultCache = new Map<string, any>();
  const pendingCache = new Map<string, Promise<any>>();
  const stats: any = {
    executed: false,
    names: [] as string[],
    counts: {} as Record<string, number>,
  };
  const normalize = (value: any): any => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      const out: any = {};
      for (const k of Object.keys(value).sort()) out[k] = normalize(value[k]);
      return out;
    }
    return value;
  };
  const canonicalizeForKey = (name: string, params: any) => {
    const p = normalize(params || {});
    try {
      if (p && typeof p === "object" && "_context" in p) {
        delete (p as any)._context;
      }
    } catch {}
    try {
      if (name === "createReminder" && p) {
        if (typeof p.title === "string") {
          p.title = p.title.trim().toLowerCase();
        }
        if (p.reminderTime) {
          const d = new Date(p.reminderTime);
          if (!isNaN(d.getTime())) {
            const bucket = Math.floor(d.getTime() / 60000) * 60000;
            p.reminderTime = new Date(bucket).toISOString();
          }
        }
      }
    } catch {}
    return p;
  };
  const buildKey = (name: string, params: any) =>
    `${name}:${JSON.stringify(canonicalizeForKey(name, params))}`;
  const dedupe = <T>(name: string, fn: (params: any) => Promise<T>) => {
    return async (params: any): Promise<T> => {
      const key = buildKey(name, params);
      stats.executed = true;
      stats.names.push(name);
      stats.counts[name] = (stats.counts[name] || 0) + 1;
      logInfo(`Executing tool: ${name}`, {
        params: JSON.stringify(params).substring(0, 200),
        paramKeys: params ? Object.keys(params) : [],
      });
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
          const augmentedParams = context
            ? { ...(params || {}), _context: context }
            : params;
          const res = await fn(augmentedParams);
          logInfo(`Tool ${name} succeeded`, {
            resultKeys: res && typeof res === "object" ? Object.keys(res) : [],
          });
          resultCache.set(key, res);
          return res;
        } catch (error: any) {
          const errorResponse = {
            success: false,
            error: true,
            message: error.message || "Operation failed",
            errorCode: error.code || "UNKNOWN_ERROR",
            details: error.statusCode
              ? `Status: ${error.statusCode}`
              : undefined,
          } as any;
          logError(`Tool ${name} failed`, error, {
            params,
            errorMessage: error.message,
            errorCode: error.code,
            errorStack: error.stack?.substring(0, 500),
          });
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
