import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

/**
 * 读请求加速：生产环境下把 supabase-js 的 GET / HEAD 请求改写到同域 `/api/db`，
 * 由 Cloudflare Worker 在海外节点回源 Supabase（supabase.co 国内直连慢且不稳定）。
 *
 * - 只对 /rest/v1/ 生效，写操作（POST / PATCH / DELETE）保持直连，行为不变
 * - 分页用的 Range / Prefer 头随 init 原样透传给 Worker，由 Worker 转发给 Supabase
 * - 开发环境不启用（vite 没有 Worker），保持直连
 */
const REST_PREFIX = "/rest/v1/";
const DB_PROXY_BASE = "/api/db";

function toDbProxyUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!u.pathname.startsWith(REST_PREFIX)) return null;
    return `${DB_PROXY_BASE}/${u.pathname.slice(REST_PREFIX.length)}${u.search}`;
  } catch {
    return null;
  }
}

const dbProxyFetch: typeof fetch = (input, init) => {
  try {
    const method = (
      init?.method ??
      (typeof input === "object" && "method" in input ? (input as Request).method : "GET") ??
      "GET"
    )
      .toString()
      .toUpperCase();
    if (method !== "GET" && method !== "HEAD") return fetch(input, init);

    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const proxyUrl = toDbProxyUrl(raw);
    if (!proxyUrl) return fetch(input, init);
    return fetch(proxyUrl, init);
  } catch {
    return fetch(input, init);
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  ...(import.meta.env.PROD ? { global: { fetch: dbProxyFetch } } : {}),
});

export function isSupabaseConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_KEY;
}
