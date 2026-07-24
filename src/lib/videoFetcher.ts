/**
 * 多平台视频链接自动抓取服务。
 *
 * 支持的平台：
 * - YouTube: YouTube Data API v3 (需要 VITE_YOUTUBE_API_KEY) 或 oEmbed 降级
 * - Bilibili: Bilibili Web API（三级降级：构建时预取 → Vite 开发代理 → CORS 代理服务）
 *
 * 缓存策略：URL → 结果缓存到 localStorage（key: URL 的 hash），24 小时 TTL。
 */
import videoPreFetch from "@/data/video-meta.json";

// ==================== 类型定义 ====================

/** 统一的视频信息返回格式 */
export interface VideoInfo {
  platform: "youtube" | "bilibili";
  title: string;
  thumbnail: string;
  viewCount: number;
  publishedAt: string;
  duration: string;
  /** 人类可读的时长，如 "1小时15分" */
  durationFormatted: string;
  /** 人类可读的播放量，如 "280万" */
  viewCountFormatted: string;
  url: string;
}

/** 抓取错误类型 */
export type FetchErrorCode =
  | "unsupported"
  | "not-found"
  | "api-error"
  | "quota-exceeded"
  | "network";

export class FetchError extends Error {
  code: FetchErrorCode;
  constructor(message: string, code: FetchErrorCode) {
    super(message);
    this.name = "FetchError";
    this.code = code;
  }
}

// ==================== 缓存层 ====================

const CACHE_KEY = "hsik_video_fetch_cache";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  info: VideoInfo;
  fetchedAt: number;
}

function loadCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

function saveCache(cache: Record<string, CacheEntry>): void {
  try {
    // 清理 30 天前的过期条目释放空间
    const cutoff = Date.now() - 30 * ONE_DAY_MS;
    const cleaned: Record<string, CacheEntry> = {};
    for (const [key, entry] of Object.entries(cache)) {
      if (entry.fetchedAt > cutoff) cleaned[key] = entry;
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cleaned));
  } catch {
    /* ignore */
  }
}

function getCacheKey(url: string): string {
  // 对于 YouTube 链接，使用 videoId 作为 key，避免不同 URL 格式产生不同缓存
  const ytId = extractYouTubeId(url);
  if (ytId) {
    return `yt:${ytId}`;
  }

  // Bilibili 同理
  const bvid = extractBilibiliId(url);
  if (bvid) {
    return `bl:${bvid}`;
  }

  // 其他链接用 URL hash
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }
  return `url:${Math.abs(hash)}`;
}

// ==================== 平台识别 ====================

export function detectPlatform(
  url: string
): "youtube" | "bilibili" | "unknown" {
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/bilibili\.com|b23\.tv/.test(url)) return "bilibili";
  return "unknown";
}

// ==================== URL 解析 ====================

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  // 直接输入 11 位 videoId
  if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) return url.trim();
  // URL 格式提取
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

/**
 * 从 Bilibili 链接中提取 BV 号。
 * 支持格式：
 * - https://www.bilibili.com/video/BV1xx411c7mD
 * - https://m.bilibili.com/video/BV1xx411c7mD
 * - https://b23.tv/BV1xx411c7mD
 */
export function extractBilibiliId(url: string): string | null {
  if (!url) return null;
  // bilibili.com 完整链接（含移动端 m. 前缀）
  const fullMatch = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/);
  if (fullMatch) return fullMatch[1];
  // b23.tv 短链接中直接包含 BV 号
  const b23Match = url.match(/b23\.tv\/(BV[a-zA-Z0-9]+)/i);
  if (b23Match) return b23Match[1];
  return null;
}

// ==================== 工具函数 ====================

/** 秒数 → 人类可读时长（中文格式，如 "1小时15分"） */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}小时${m}分`;
  if (m > 0) return `${m}分${s > 0 ? s + "秒" : ""}`;
  return `${s}秒`;
}

/** 秒数 → MM:SS / HH:MM:SS 格式 */
export function formatDurationMMSS(seconds: number): string {
  if (!seconds || seconds <= 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** 数字 → 人类可读播放量 */
function formatViews(views: number): string {
  if (views >= 100000000) {
    return `${(views / 100000000).toFixed(1).replace(/\.0$/, "")}亿`;
  }
  if (views >= 10000) {
    return `${(views / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  }
  return views.toLocaleString();
}

/** 解析 ISO 8601 duration (PT1H15M30S) → 秒数 */
function parseISODuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  return h * 3600 + m * 60 + s;
}

/** 时间戳秒数 → YYYY-MM-DD */
function tsToDate(ts: number): string {
  return new Date(ts * 1000).toISOString().split("T")[0];
}

// ==================== YouTube Data API v3 ====================

function getYouTubeApiKey(): string | undefined {
  // Vite 环境变量必须以 VITE_ 开头
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return (import.meta.env as any).VITE_YOUTUBE_API_KEY || undefined;
  }
  return undefined;
}

async function fetchYouTubeViaAPI(videoId: string): Promise<VideoInfo | null> {
  const apiKey = getYouTubeApiKey();
  if (!apiKey) return null;

  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,statistics,contentDetails` +
    `&id=${videoId}&key=${apiKey}`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });

  if (resp.status === 403) {
    throw new FetchError("已达到 API 调用限额", "quota-exceeded");
  }
  if (!resp.ok) {
    throw new FetchError("API 调用失败，请稍后重试", "api-error");
  }

  const data = await resp.json();
  if (!data.items || data.items.length === 0) {
    throw new FetchError("视频不存在或已删除", "not-found");
  }

  const item = data.items[0];
  const snippet = item.snippet;
  const stats = item.statistics;
  const content = item.contentDetails;

  const durationSec = content?.duration ? parseISODuration(content.duration) : 0;
  const viewCount = stats?.viewCount ? parseInt(stats.viewCount, 10) : 0;
  const publishedAt = snippet?.publishedAt
    ? snippet.publishedAt.split("T")[0]
    : "";
  const thumbnail =
    snippet?.thumbnails?.maxres?.url ||
    snippet?.thumbnails?.high?.url ||
    snippet?.thumbnails?.medium?.url ||
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  return {
    platform: "youtube",
    title: snippet?.title || "",
    thumbnail,
    viewCount,
    publishedAt,
    duration: durationSec > 0 ? formatDuration(durationSec) : "",
    durationFormatted: durationSec > 0 ? formatDurationMMSS(durationSec) : "",
    viewCountFormatted: viewCount > 0 ? formatViews(viewCount) : "",
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

// ==================== YouTube Worker 代理（服务端抓取，无 CORS 限制） ====================

/**
 * 通过 Cloudflare Worker 服务端代理获取 YouTube 视频元数据。
 *
 * 生产环境：Cloudflare Worker 直接调用 YouTube 内部 API（youtubei/v1/player），
 *   服务端无 CORS 限制，返回完整的 JSON 数据（标题、播放量、发布日期、时长）。
 * 开发环境：Vite 中间件同样在 Node.js 服务端调用，效果相同。
 *
 * 这是无需 API Key 的首选方案，比 CORS 代理爬取更可靠。
 */
async function fetchYouTubeViaWorkerProxy(videoId: string): Promise<VideoInfo | null> {
  const url = `https://hyunsik-log.siklog.workers.dev/api/youtube-meta?videoId=${videoId}`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) {
      console.warn(`[worker] ${videoId}: HTTP ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    if (data.error) {
      console.warn(`[worker] ${videoId}: API error — ${data.error}`);
      return null;
    }
    // 要求至少返回标题，否则视为抓取失败
    if (!data.title) {
      console.warn(`[worker] ${videoId}: empty title returned`);
      return null;
    }

    const durationSec = data.lengthSeconds || 0;
    const viewCount = data.viewCount || 0;

    return {
      platform: "youtube",
      title: data.title,
      thumbnail: data.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      viewCount,
      publishedAt: data.publishedAt || "",
      duration: durationSec > 0 ? formatDuration(durationSec) : "",
      durationFormatted: durationSec > 0 ? formatDurationMMSS(durationSec) : "",
      viewCountFormatted: viewCount > 0 ? formatViews(viewCount) : "",
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  } catch (e) {
    console.warn(`[worker] ${videoId}: network error`, e);
    return null;
  }
}

// ==================== YouTube oEmbed（浏览器直连，支持 CORS） ====================

/**
 * 通过 YouTube oEmbed API 获取视频基本信息。
 *
 * oEmbed 是 YouTube 官方的嵌入 API，支持 CORS（浏览器可直接调用），
 * 始终可用，无需 API Key，无需服务端代理。
 *
 * 返回字段：标题、封面、作者（但不含播放量、发布日期、时长）。
 * 作为 Worker 代理失败时的保底方案。
 */
async function fetchYouTubeViaOEmbed(videoId: string): Promise<VideoInfo | null> {
  let title = "";
  let thumbnail = "";
  try {
    const resp = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (resp.ok) {
      const data = await resp.json();
      title = data?.title || "";
      thumbnail = data?.thumbnail_url || "";
    }
  } catch {
    /* oEmbed failed */
  }

  if (!thumbnail) {
    thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }

  return {
    platform: "youtube",
    title,
    thumbnail,
    viewCount: 0,
    publishedAt: "",
    duration: "",
    durationFormatted: "",
    viewCountFormatted: "",
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

// ==================== 预取数据查询 ====================

function getYouTubePrefetch(videoId: string): VideoInfo | null {
  const key = `yt:${videoId}` as keyof typeof videoPreFetch;
  const data = videoPreFetch[key];
  if (!data?.fetchedAt) return null;

  return {
    platform: "youtube",
    title: data.title || "",
    thumbnail: data.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    viewCount: 0, // prefetch 存的是格式化字符串，无法还原精确数字
    publishedAt: data.publishedAt || "",
    duration: data.duration || "",
    durationFormatted: data.duration || "",
    viewCountFormatted: data.views || "",
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function getBilibiliPrefetch(bvid: string): VideoInfo | null {
  const key = `bl:${bvid}` as keyof typeof videoPreFetch;
  const data = videoPreFetch[key];
  if (!data?.fetchedAt) return null;

  let thumbnail = data.thumbnail || "";
  if (thumbnail.startsWith("//")) thumbnail = `https:${thumbnail}`;

  return {
    platform: "bilibili",
    title: data.title || "",
    thumbnail,
    viewCount: 0,
    publishedAt: data.publishedAt || "",
    duration: data.duration || "",
    durationFormatted: data.duration || "",
    viewCountFormatted: data.views || "",
    url: `https://www.bilibili.com/video/${bvid}`,
  };
}

// ==================== Bilibili API ====================

/** 从 Bilibili API 原始响应构建统一的 VideoInfo */
function buildBilibiliVideoInfo(raw: any, bvid: string): VideoInfo | null {
  if (raw?.code !== 0 || !raw?.data) return null;
  const d = raw.data;
  const durationSec = d.duration || 0;
  const viewCount = d.stat?.view || 0;
  const publishedAt = d.pubdate ? tsToDate(d.pubdate) : "";
  // Bilibili pic 可能返回 //i0.hdslb.com/... 缺少协议头，需补全 https:
  let thumbnail = d.pic || "";
  if (thumbnail.startsWith("//")) thumbnail = `https:${thumbnail}`;

  return {
    platform: "bilibili",
    title: d.title || "",
    thumbnail,
    viewCount,
    publishedAt,
    duration: formatDuration(durationSec),
    durationFormatted: formatDurationMMSS(durationSec),
    viewCountFormatted: formatViews(viewCount),
    url: `https://www.bilibili.com/video/${bvid}`,
  };
}

/** CORS 代理服务列表（按优先级排序） */
const BILIBILI_PROXY_SERVICES = [
  // allorigins — 返回原始 JSON
  (apiUrl: string) =>
    `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`,
  // corsproxy.io
  (apiUrl: string) =>
    `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`,
];

/** 通过公共 CORS 代理服务抓取 Bilibili 视频信息（生产环境降级方案） */
async function fetchBilibiliViaProxy(bvid: string): Promise<VideoInfo | null> {
  const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;

  for (const buildUrl of BILIBILI_PROXY_SERVICES) {
    try {
      const resp = await fetch(buildUrl(apiUrl), {
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const result = buildBilibiliVideoInfo(data, bvid);
      if (result) return result;
    } catch {
      // 当前代理不可用，尝试下一个
      continue;
    }
  }

  return null;
}

async function fetchBilibiliViaAPI(bvid: string): Promise<VideoInfo | null> {
  // 第一优先级：构建时预取数据（零网络开销，即时返回）
  const prefetched = getBilibiliPrefetch(bvid);
  if (prefetched) return prefetched;

  // 第二优先级：开发模式 Vite 代理直连 Bilibili API（最快）
  if (import.meta.env.DEV) {
    try {
      const resp = await fetch(
        `/api/bilibili/x/web-interface/view?bvid=${bvid}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (resp.ok) {
        const data = await resp.json();
        const result = buildBilibiliVideoInfo(data, bvid);
        if (result) return result;
      }
    } catch {
      // 开发代理失败，降级到 CORS 代理
    }
  }

  // 第三优先级：公共 CORS 代理服务（生产环境兜底）
  return fetchBilibiliViaProxy(bvid);
}

// ==================== 主入口 ====================

/**
 * 从视频链接抓取完整信息（含 24h 缓存）。
 *
 * @throws {FetchError} 不支持的平台 / API 失败 / 视频不存在
 */
export async function fetchVideoInfo(url: string): Promise<VideoInfo> {
  let cleanUrl = url.trim();
  if (!cleanUrl) {
    throw new FetchError("请提供有效的视频链接", "unsupported");
  }

  // 标准化 YouTube URL：统一转为 watch?v= 格式
  const ytId = extractYouTubeId(cleanUrl);
  if (ytId && detectPlatform(cleanUrl) === "youtube") {
    cleanUrl = `https://www.youtube.com/watch?v=${ytId}`;
  }

  // 检查缓存
  const cache = loadCache();
  const cacheKey = getCacheKey(cleanUrl);
  const cached = cache[cacheKey];
  if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < ONE_DAY_MS) {
    return cached.info;
  }

  const platform = detectPlatform(cleanUrl);
  let result: VideoInfo | null = null;

  if (platform === "youtube") {
    const videoId = extractYouTubeId(cleanUrl);
    if (!videoId) {
      throw new FetchError("无法解析 YouTube 链接", "unsupported");
    }

    // 1. 预取数据（作为保底）
    result = getYouTubePrefetch(videoId);

    // 2. Worker 代理（优先获取完整数据）
    try {
      const workerResult = await fetchYouTubeViaWorkerProxy(videoId);
      if (workerResult && workerResult.title) {
        result = {
          ...result,
          ...workerResult,
          viewCountFormatted: workerResult.viewCountFormatted || result?.viewCountFormatted || "",
          publishedAt: workerResult.publishedAt || result?.publishedAt || "",
          duration: workerResult.duration || result?.duration || "",
          durationFormatted: workerResult.durationFormatted || result?.durationFormatted || "",
          thumbnail: workerResult.thumbnail || result?.thumbnail || "",
        };
      }
    } catch {
      // Worker 失败，继续用预取数据
    }

    // 3. YouTube Data API（补充精确数字）
    try {
      const apiResult = await fetchYouTubeViaAPI(videoId);
      if (apiResult) {
        result = {
          ...result,
          ...apiResult,
          viewCountFormatted: apiResult.viewCountFormatted || result?.viewCountFormatted || "",
          publishedAt: apiResult.publishedAt || result?.publishedAt || "",
          duration: apiResult.duration || result?.duration || "",
          durationFormatted: apiResult.durationFormatted || result?.durationFormatted || "",
          thumbnail: apiResult.thumbnail || result?.thumbnail || "",
        };
      }
    } catch (e) {
      if (e instanceof FetchError && e.code === "quota-exceeded") {
        if (!result) throw e;
      } else if (e instanceof FetchError) {
        if (!result) throw e;
      }
    }

    // 4. oEmbed 保底
    if (!result) {
      try {
        const oembedResult = await fetchYouTubeViaOEmbed(videoId);
        if (oembedResult) {
          result = oembedResult;
        }
      } catch {
        // oEmbed 也失败
      }
    }

    if (!result) {
      throw new FetchError("API 调用失败，请稍后重试", "api-error");
    }
  } else if (platform === "bilibili") {
    const bvid = extractBilibiliId(cleanUrl);
    if (!bvid) {
      throw new FetchError("无法解析 Bilibili 链接", "unsupported");
    }

    result = await fetchBilibiliViaAPI(bvid);

    if (!result) {
      // 预取数据 + 开发代理 + CORS 代理全部未命中
      throw new FetchError(
        "视频不存在或 API 调用失败，请检查 BV 号是否正确",
        "not-found"
      );
    }
  } else {
    throw new FetchError("该平台暂不支持自动抓取，请手动填写", "unsupported");
  }

  // 写入缓存
  cache[cacheKey] = { info: result, fetchedAt: Date.now() };
  saveCache(cache);

  return result;
}

/**
 * 同步查询缓存中的视频信息（不发起网络请求）。
 * 用于表单初始化时快速检查是否已有缓存数据。
 */
export function getCachedVideoInfo(url: string): VideoInfo | null {
  const cleanUrl = url.trim();
  if (!cleanUrl) return null;
  const cache = loadCache();
  const cacheKey = getCacheKey(cleanUrl);
  const cached = cache[cacheKey];
  if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < ONE_DAY_MS) {
    return cached.info;
  }
  return null;
}
