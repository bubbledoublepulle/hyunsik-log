/**
 * Pages Functions 版图片代理（与 worker/index.js 的 handleImageProxy 保持一致）
 *
 * 背景：自定义域上 /api/* 有时会被 Pages 的 SPA 回退接管，返回 index.html（状态码 200）
 * 而不是图片，浏览器拿到 HTML 无法渲染成图片，表现为"图片全部白屏"。
 * 这里在 Pages Functions 上补一份同逻辑实现，保证无论请求落到 Worker 还是 Pages，
 * /api/image-proxy 都返回真正的图片字节。
 *
 * 字节透传：不解码 / 不重编码 / 不缩放，画质与源站完全一致。
 */

const ALLOWED_IMAGE_HOST_SUFFIXES = [
  "ytimg.com", "youtube.com", "ggpht.com",
  "twimg.com", "twitter.com", "x.com",
  "cdninstagram.com", "fbcdn.net", "instagram.com",
  "wevpstatic.net", "weverse.io",
  "imweb.me", "namu.wiki", "melon.co.kr",
];

function isAllowedImageHost(hostname) {
  const host = hostname.toLowerCase();
  return ALLOWED_IMAGE_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

const IMAGE_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  "Sec-Fetch-Dest": "image",
  "Sec-Fetch-Mode": "no-cors",
};

const IMAGE_CACHE_TTL = 7 * 24 * 60 * 60;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const imageUrl = url.searchParams.get("url");

  if (!imageUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  let target;
  try {
    target = new URL(decodeURIComponent(imageUrl));
  } catch {
    return new Response("Invalid url parameter", { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return new Response("Invalid protocol", { status: 400 });
  }
  if (!isAllowedImageHost(target.hostname)) {
    return new Response("Host not allowed", { status: 403 });
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: "GET" });

  try {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("X-Image-Proxy-Cache", "HIT");
      return new Response(hit.body, { status: 200, headers });
    }
  } catch {
    // 缓存不可用时直接回源
  }

  try {
    let imageResp = await fetch(target.toString(), {
      headers: { ...IMAGE_FETCH_HEADERS, Referer: target.origin },
    });

    // YouTube 对没有 maxres 的视频返回 404，自动降级到 hqdefault
    if (imageResp.status === 404 && /\/vi\/.+\/maxresdefault\.jpg$/.test(target.pathname)) {
      const fallback = new URL(target.toString());
      fallback.pathname = target.pathname.replace(/\/maxresdefault\.jpg$/, "/hqdefault.jpg");
      const fallbackResp = await fetch(fallback.toString(), {
        headers: { ...IMAGE_FETCH_HEADERS, Referer: fallback.origin },
      });
      if (fallbackResp.ok) imageResp = fallbackResp;
    }

    if (!imageResp.ok) {
      return new Response("Failed to fetch image", { status: 502 });
    }

    const headers = new Headers(imageResp.headers);
    headers.set("Cache-Control", `public, max-age=${IMAGE_CACHE_TTL}`);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("X-Image-Proxy-Cache", "MISS");
    if (!headers.has("Content-Type")) headers.set("Content-Type", "image/jpeg");
    // 防止被 SPA 回退改写：显式声明这是图片响应
    headers.set("X-Content-Type-Options", "nosniff");

    // 完整读入内存后再返回，避免流式转发被截断（浏览器拿到 jpeg 头却解不出图像）
    const buffer = await imageResp.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      return new Response("Empty image response", { status: 502 });
    }

    const resp = new Response(buffer, { status: 200, headers });
    try {
      context.waitUntil(cache.put(cacheKey, resp.clone()));
    } catch {
      // 写入缓存失败不影响本次响应
    }
    return resp;
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
}
