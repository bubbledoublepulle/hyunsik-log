/**
 * 统一图片代理
 *
 * 背景：站里大量图片来自境外图床（i.ytimg.com / pbs.twimg.com / i.namu.wiki /
 * cdnimg.melon.co.kr / phinf.wevpstatic.net 等），国内直连基本不可达，卡片会一直转圈。
 *
 * 方案：统一经自家 Cloudflare Worker 的 `/api/image-proxy` 转发。
 * 该接口是**字节透传**（`new Response(imageResp.body)`，沿用源站 Content-Type，
 * 只覆盖 Cache-Control / CORS），不解码不重编码不缩放，因此**画质完全不变**。
 *
 * 图片域名与页面同域（siklog.work），浏览器无需再连境外站点。
 */

/** 需要走代理的境外图床（按 host 后缀匹配） */
const PROXY_HOST_SUFFIXES = [
  // YouTube
  "ytimg.com",
  "youtube.com",
  "ggpht.com",
  // X / Twitter
  "twimg.com",
  "twitter.com",
  "x.com",
  // Instagram / Facebook
  "cdninstagram.com",
  "fbcdn.net",
  "instagram.com",
  // Weverse
  "wevpstatic.net",
  "weverse.io",
  // 音乐封面来源（韩国站点）
  "imweb.me",
  "namu.wiki",
  "melon.co.kr",
];

/** 本站域名：已经是自家代理产出的 URL，不再二次代理 */
const SELF_HOST_SUFFIXES = ["siklog.work", "pages.dev", "localhost"];

function getHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function matchesSuffix(host: string, suffixes: string[]): boolean {
  return suffixes.some((s) => host === s || host.endsWith(`.${s}`));
}

/** 该图片是否需要走代理 */
export function needsImageProxy(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false; // 相对路径 / data: / blob: 不处理
  const host = getHost(url);
  if (!host) return false;
  if (matchesSuffix(host, SELF_HOST_SUFFIXES)) return false;
  return matchesSuffix(host, PROXY_HOST_SUFFIXES);
}

/**
 * 返回可直接用于 <img src> 的地址：需要代理的外链图走 /api/image-proxy，其余原样返回。
 * 开发环境由 vite.config.ts 的 proxy 把 /api/image-proxy 转发到线上 Worker。
 */
export function proxiedImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (!needsImageProxy(url)) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

/**
 * <img> onError 兜底：先带一个随机参数原样重试一次（绕开被截断/损坏的响应），
 * 仍失败才返回 false，由调用方隐藏图片。
 *
 * @returns true 表示已安排重试，本次不要隐藏图片
 */
export function retryImageOnce(img: HTMLImageElement | null | undefined): boolean {
  if (!img) return false;
  if (img.dataset.imgRetried === "1") return false;
  img.dataset.imgRetried = "1";
  try {
    const u = new URL(img.src, window.location.href);
    u.searchParams.set("_r", Date.now().toString());
    img.src = u.toString();
    return true;
  } catch {
    return false;
  }
}
