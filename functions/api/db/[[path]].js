/**
 * Pages Functions 版 Supabase 只读代理（与 worker/index.js 的 handleDbProxy 一致）
 *
 * 用途：/api/db 若被 Pages SPA 回退接管会返回 HTML，supabase-js 解析失败。
 * 这里补一份实现，保证读数据请求始终返回 JSON。
 *
 * 约束：仅 GET / HEAD；仅白名单表 shows / social_posts / music；不缓存。
 */

const ALLOWED_DB_TABLES = new Set(["shows", "social_posts", "music"]);

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);

  // params.path 形如 "shows" 或 "shows/xxx"（[[path]] 捕获 /api/db 之后的部分）
  const rest = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  const table = rest.split("/")[0];
  if (!ALLOWED_DB_TABLES.has(table)) {
    return Response.json({ error: "table not allowed" }, { status: 403 });
  }

  const base = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_KEY;
  if (!base || !anonKey) {
    return Response.json({ error: "supabase not configured" }, { status: 500 });
  }

  const headers = new Headers();
  headers.set("apikey", anonKey);
  headers.set("Authorization", `Bearer ${anonKey}`);
  headers.set("Accept", request.headers.get("Accept") || "application/json");
  const prefer = request.headers.get("Prefer");
  if (prefer) headers.set("Prefer", prefer);
  const range = request.headers.get("Range"); // supabase-js 分页走 Range 头
  if (range) headers.set("Range", range);
  const acceptProfile = request.headers.get("Accept-Profile");
  if (acceptProfile) headers.set("Accept-Profile", acceptProfile);

  try {
    const resp = await fetch(`${base}/rest/v1/${rest}${url.search}`, {
      method: "GET",
      headers,
    });
    const out = new Headers(resp.headers);
    out.set("Cache-Control", "no-store");
    out.set("Access-Control-Allow-Origin", "*");
    out.set("Content-Type", "application/json");
    return new Response(resp.body, { status: resp.status, headers: out });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}

export async function onRequestHead(context) {
  return onRequestGet(context);
}
