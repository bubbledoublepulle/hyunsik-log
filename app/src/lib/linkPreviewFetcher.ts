/**
 * 社交链接预览抓取服务。
 *
 * 通过 CORS 代理获取目标页面 HTML，提取 Open Graph / Twitter Card 元标签，
 * 实现粘贴链接后自动填入文案和图片。
 *
 * 支持的平台：X (Twitter)、Instagram、Weverse、YouTube Community、fromm、Fan Club
 *
 * 缓存策略：URL → 结果缓存到 localStorage，24 小时 TTL。
 */

// ==================== 类型定义 ====================

export interface LinkPreview {
  url: string;
  /** 识别出的平台 */
  platform: string;
  /** og:title / twitter:title */
  title: string;
  /** og:description / twitter:description */
  description: string;
  /** 图片列表（og:image / twitter:image） */
  images: string[];
  /** article:published_time / og:article:published_time */
  date: string;
  /** 推测的作者名 */
  author: string;
}

export type LinkFetchErrorCode =
  | "unsupported"
  | "not-found"
  | "network"
  | "parse-error";

export class LinkFetchError extends Error {
  code: LinkFetchErrorCode;
  constructor(message: string, code: LinkFetchErrorCode) {
    super(message);
    this.name = "LinkFetchError";
    this.code = code;
  }
}

// ==================== 平台识别 ====================

export function detectSocialPlatform(url: string): string {
  const u = url.toLowerCase();
  if (/twitter\.com|x\.com/.test(u)) return "X";
  if (/instagram\.com/.test(u)) return "Instagram";
  if (/weverse\.io/.test(u)) return "Weverse";
  if (/youtube\.com\/(channel|c|user|@|post)/.test(u)) return "YouTube Community";
  if (/fromm\.jp|bubble\./.test(u)) return "fromm";
  if (/fan\s*club|fancafe|daum\.net\/cafe/i.test(u)) return "Fan Club";
  return "unknown";
}

// ==================== 缓存层 ====================

const CACHE_KEY = "hsik_link_preview_cache";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  preview: LinkPreview;
  fetchedAt: number;
}

function loadCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveCache(cache: Record<string, CacheEntry>): void {
  try {
    const cutoff = Date.now() - 30 * ONE_DAY_MS;
    const cleaned: Record<string, CacheEntry> = {};
    for (const [key, entry] of Object.entries(cache)) {
      if (entry.fetchedAt > cutoff) cleaned[key] = entry;
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cleaned));
  } catch { /* ignore */ }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `url:${Math.abs(hash)}`;
}

// ==================== 元标签提取 ====================

/**
 * 从 HTML 中提取 OG / Twitter Card 元标签。
 *
 * 优先级：og:* > twitter:* > 其他 meta
 */
function extractMetaFromHtml(html: string): {
  title: string;
  description: string;
  images: string[];
  date: string;
  author: string;
} {
  // 辅助：获取 meta content 属性
  const getMeta = (nameOrProperty: string): string | null => {
    // 匹配 <meta name="X" content="Y"> 或 <meta property="X" content="Y">
    const regex = new RegExp(
      `<meta\\s[^>]*?(?:name|property)=["']${escapeRegex(nameOrProperty)}["'][^>]*?content=["']([^"']*)["']`,
      "i"
    );
    const match = html.match(regex);
    return match ? match[1] : null;
  };

  // 标题
  const title =
    getMeta("og:title") ||
    getMeta("twitter:title") ||
    "";

  // 描述
  const description =
    getMeta("og:description") ||
    getMeta("twitter:description") ||
    "";

  // 图片
  const images: string[] = [];
  const ogImage = getMeta("og:image");
  const twImage = getMeta("twitter:image");
  if (ogImage) images.push(ensureAbsoluteUrl(ogImage));
  if (twImage && twImage !== ogImage) images.push(ensureAbsoluteUrl(twImage));

  // 多张 og:image（Instagram 等有时会返回多张）
  const ogImageRegex = /<meta\s[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/gi;
  let imgMatch: RegExpExecArray | null;
  let count = 0;
  while ((imgMatch = ogImageRegex.exec(html)) !== null && count < 10) {
    const url = ensureAbsoluteUrl(imgMatch[1]);
    if (!images.includes(url)) images.push(url);
    count++;
  }

  // 日期
  const date =
    getMeta("article:published_time") ||
    getMeta("og:article:published_time") ||
    "";

  // 作者
  const author =
    getMeta("og:site_name") ||
    getMeta("twitter:creator") ||
    // Weverse 特有
    getMeta("weverse:artist") ||
    "";

  return { title, description, images, date, author };
}

/** 从社交媒体 URL 中提取用户名 */
function extractUsernameFromUrl(url: string, platform: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    
    if (platform === "X" || platform === "Twitter") {
      // X/Twitter: /username/status/123 或 /username → username
      // 路径格式: /HSIK_INBLUE/status/123456 → HSIK_INBLUE
      const match = path.match(/^\/([^\/]+?)(?:\/status\/|\/|\?|$)/);
      if (match && match[1] && match[1] !== "i" && match[1] !== "home") {
        return `@${match[1]}`;
      }
    }
    
    if (platform === "Instagram") {
      // Instagram: /username/p/ABC123 或 /p/ABC123
      const match = path.match(/^\/([^\/]+)(?:\/p\/|$)/);
      if (match && match[1] !== "p") return `@${match[1]}`;
    }
    
    if (platform === "Weverse") {
      // Weverse: artist 名通常在路径里
      const match = path.match(/^\/([^\/]+)/);
      if (match) return match[1];
    }
  } catch {
    // URL 解析失败
  }
  return "";
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 补全相对路径的图片 URL（如 //cdn.example.com/img.jpg → https://cdn.example.com/img.jpg） */
function ensureAbsoluteUrl(url: string): string {
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return url; // 相对路径无法补全，保留原样
  return url;
}

// ==================== CORS 代理抓取 ====================

const CORS_PROXIES = [
  (u: string) =>
    `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u: string) =>
    `https://corsproxy.io/?${encodeURIComponent(u)}`,
];

/** Microlink API — 专门处理社交媒体（X/Twitter、Instagram 等） */
async function fetchViaMicrolink(url: string): Promise<LinkPreview | null> {
  try {
    const resp = await fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!resp.ok) return null;
    
    const data = await resp.json();
    if (!data.data) return null;
    
    const d = data.data;
    const images: string[] = [];
    if (d.image?.url) images.push(d.image.url);
    if (d.logo?.url && !images.includes(d.logo.url)) images.push(d.logo.url);
    
    // 从 URL 提取真实用户名，强制覆盖 API 返回的平台名称
    const usernameFromUrl = extractUsernameFromUrl(url, detectSocialPlatform(url));
    // 对于社交媒体，URL 里的用户名比 API 返回的平台名称更准确
    const author = usernameFromUrl || d.author || d.publisher || "";

    return {
      url,
      platform: detectSocialPlatform(url),
      title: d.title || "",
      description: d.description || "",
      images,
      date: d.date || "",
      author,
    };
  } catch {
    return null;
  }
}

/**
 * 通过 CORS 代理抓取目标页面 HTML。
 * 开发模式额外尝试 Vite 代理（如果有对应规则）。
 */
async function fetchPageHtml(url: string): Promise<string> {
  // 尝试所有 CORS 代理
  for (const buildUrl of CORS_PROXIES) {
    try {
      const resp = await fetch(buildUrl(url), {
        signal: AbortSignal.timeout(12000),
      });
      if (resp.ok) {
        const html = await resp.text();
        if (html.length > 500) return html; // 确保不是空响应
      }
    } catch {
      continue;
    }
  }

  throw new LinkFetchError("无法访问目标页面，请检查链接是否正确", "network");
}

// ==================== 主入口 ====================

/**
 * 从链接抓取预览信息（含 24h 缓存）。
 *
 * @param url 目标链接
 * @throws {LinkFetchError} 抓取失败
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    throw new LinkFetchError("请提供有效的链接", "unsupported");
  }

  // 检查缓存
  const cache = loadCache();
  const cacheKey = simpleHash(cleanUrl);
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < ONE_DAY_MS) {
    return cached.preview;
  }

  // 平台识别
  const platform = detectSocialPlatform(cleanUrl);
  if (platform === "unknown") {
    throw new LinkFetchError(
      "暂不支持该平台自动抓取，请手动填写",
      "unsupported"
    );
  }

  // 先尝试 CORS 代理抓取
  let html = "";
  try {
    html = await fetchPageHtml(cleanUrl);
  } catch {
    // CORS 代理失败，尝试 Microlink API（对 X/Twitter、Instagram 更有效）
    const microlinkResult = await fetchViaMicrolink(cleanUrl);
    if (microlinkResult) {
      // 写入缓存
      cache[cacheKey] = { preview: microlinkResult, fetchedAt: Date.now() };
      saveCache(cache);
      return microlinkResult;
    }
    // Microlink 也失败，抛出原始错误
    throw new LinkFetchError("无法访问目标页面，请检查链接是否正确", "network");
  }

  // 提取元标签
  const meta = extractMetaFromHtml(html);

  // 至少要有标题或描述才认为成功
  if (!meta.title && !meta.description) {
    throw new LinkFetchError("页面未包含可提取的内容信息", "parse-error");
  }

  // 从 URL 提取真实用户名，强制覆盖元标签里的平台名称
  const usernameFromUrl = extractUsernameFromUrl(cleanUrl, platform);
  // 对于 X/Twitter/Instagram，优先使用 URL 里的用户名
  const author = usernameFromUrl || meta.author;

  const preview: LinkPreview = {
    url: cleanUrl,
    platform,
    title: meta.title,
    description: meta.description,
    images: meta.images,
    date: meta.date,
    author,
  };

  // 写入缓存
  cache[cacheKey] = { preview, fetchedAt: Date.now() };
  saveCache(cache);

  return preview;
}

/**
 * 同步查询缓存中的预览信息（不发起网络请求）。
 */
export function getCachedPreview(url: string): LinkPreview | null {
  const cleanUrl = url.trim();
  if (!cleanUrl) return null;
  const cache = loadCache();
  const cacheKey = simpleHash(cleanUrl);
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < ONE_DAY_MS) {
    return cached.preview;
  }
  return null;
}
