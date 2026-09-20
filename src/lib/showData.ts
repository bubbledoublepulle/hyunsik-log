import { supabase, isSupabaseConfigured } from "./supabase";

// 全局锁，防止 saveShowData 并发执行导致数据竞态
let saveShowDataPromise: Promise<ShowSaveResult> | null = null;

export type ShowMember =
  | "任炫植"
  | "徐恩光"
  | "李旼赫"
  | "李昌燮"
  | "Peniel"
  | "陆星材"
  | "BTOB"
  | "BCOM组";

export type ArchiveStatus = "已补档" | "待补档";

/** 单条视频链接，支持同一视频在不同平台的发布 */
export interface VideoLink {
  platform: string;
  url: string;
}

export interface ShowItem {
  id: string;
  title: string;
  platform: string;
  date: string;
  duration: string;
  views: string;
  members: ShowMember[];
  status: ArchiveStatus;
  thumbnailFrom: string;
  thumbnailTo: string;
  description: string;
  /** 多平台链接列表 */
  links: VideoLink[];
  /** 保留旧字段用于数据迁移兼容 */
  link?: string;
}

/** 从 API 抓取到的视频元数据 */
export interface VideoMetadata {
  /** 视频标题 */
  title?: string;
  /** 封面图 URL */
  thumbnail?: string;
  /** 时长（人类可读，如 "1:15:00"） */
  duration?: string;
  /** 时长秒数（优先用于格式化） */
  lengthSeconds?: number;
  /** 播放量（人类可读，如 "280万"） */
  views?: string;
  /** 发布时间（YYYY-MM-DD格式） */
  publishedAt?: string;
  /** 数据来源平台 */
  source: string;
  /** 抓取时间戳 (ms) */
  fetchedAt: number;
}

// 旧示例数据已移除；不再提供默认占位综艺，首次加载应显示空态/加载动画。

const STORAGE_KEY = "hsik_shows_data";
const SYNC_AT_KEY = "hsik_shows_sync_at";

/** 旧版示例数据 ID 集合（s01-s08），sync 时会自动剔除 */
const LEGACY_SAMPLE_IDS = new Set(["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08"]);

function recordSyncTime() {
  try { localStorage.setItem(SYNC_AT_KEY, Date.now().toString()); } catch {}
}
const META_CACHE_KEY = "hsik_show_metadata_cache";
/** 缓存格式版本号，修改此值可强制清空旧格式缓存 */
const CACHE_VERSION = "v3";
const CACHE_VERSION_KEY = "hsik_cache_version";

// ─── 数据库 ↔ 前端 类型转换 ───

function toDbRow(item: ShowItem) {
  return {
    id: item.id,
    title: item.title,
    platform: item.platform,
    date: item.date,
    duration: item.duration,
    views: item.views,
    members: item.members,
    status: item.status,
    thumbnail_from: item.thumbnailFrom,
    thumbnail_to: item.thumbnailTo,
    description: item.description,
    links: item.links,
  };
}

export function fromDbRow(row: Record<string, unknown>): ShowItem {
  return {
    id: String(row.id),
    title: String(row.title),
    platform: String(row.platform),
    date: String(row.date),
    duration: String(row.duration ?? ""),
    views: String(row.views ?? ""),
    members: Array.isArray(row.members) ? (row.members as string[]).map(String) as ShowMember[] : [],
    status: String(row.status) as ArchiveStatus,
    thumbnailFrom: String(row.thumbnail_from ?? ""),
    thumbnailTo: String(row.thumbnail_to ?? ""),
    description: String(row.description ?? ""),
    links: Array.isArray(row.links) ? (row.links as VideoLink[]) : [],
  };
}

// ─── localStorage（本地缓存） ───

/** 数据迁移：旧数据只有 link 字符串，转为 links 数组 */
function migrateItem(item: Partial<ShowItem> & { id: string }): ShowItem {
  if (item.links && Array.isArray(item.links) && item.links.length > 0) {
    return item as ShowItem;
  }
  const oldLink = item.link || "https://www.youtube.com";
  let platform = "YouTube";
  if (oldLink.includes("bilibili.com")) platform = "Bilibili";
  else if (oldLink.includes("vlive.tv")) platform = "V LIVE";
  else if (oldLink.includes("weverse.io")) platform = "Weverse";
  return {
    ...item,
    links: [{ platform, url: oldLink }],
  } as ShowItem;
}

export function loadShowData(): ShowItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.map((item: Partial<ShowItem> & { id: string }) => migrateItem(item));
      }
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

export function saveLocalShowData(data: ShowItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

/** 导入前备份，返回备份 key */
export function backupShowData(): string {
  const key = `${STORAGE_KEY}_backup_${Date.now()}`;
  try {
    localStorage.setItem(key, JSON.stringify(loadShowData()));
  } catch {}
  return key;
}

// ─── Supabase 读写 ───

export async function syncShowData(): Promise<ShowItem[]> {
  if (!isSupabaseConfigured()) {
    return loadShowData();
  }

  const PAGE_SIZE = 100;
  let allRows: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("shows")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      if (import.meta.env.DEV) console.warn("[shows] sync failed:", error.message);
      return loadShowData();
    }

    if (data && data.length > 0) {
      allRows = allRows.concat(data);
      hasMore = data.length === PAGE_SIZE;
      from += PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  const items = allRows.map(fromDbRow);
  // 自愈：剔除旧版示例数据（s01-s08），避免污染真实档案
  const localData = loadShowData().filter((i) => !LEGACY_SAMPLE_IDS.has(i.id));

  // 合并：保留云端数据 + 本地独有的数据（防止未上传成功的数据被覆盖）
  const remoteIds = new Set(items.map((i) => i.id));
  const merged = [...items, ...localData.filter((i) => !remoteIds.has(i.id))];

  saveLocalShowData(merged);
  recordSyncTime();

  return merged;
}

export interface ShowSaveResult {
  error: string | null;
  /** 检测到 ID 重复被丢弃的条目 */
  conflicts?: { id: string; kept: ShowItem; dropped: ShowItem }[];
  /** 是否可重试（网络类错误） */
  retriable?: boolean;
}

export async function saveShowData(data: ShowItem[]): Promise<ShowSaveResult> {
  // 按 ID 去重，保留第一个
  const seen = new Map<string, ShowItem>();
  const conflicts: { id: string; kept: ShowItem; dropped: ShowItem }[] = [];
  for (const item of data) {
    const prev = seen.get(item.id);
    if (prev) conflicts.push({ id: item.id, kept: prev, dropped: item });
    else seen.set(item.id, item);
  }
  if (conflicts.length && import.meta.env.DEV) {
    console.error("[saveShowData] 检测到重复 ID，已丢弃:", conflicts);
  }
  const uniqueData = [...seen.values()];

  // 串行化
  if (saveShowDataPromise) await saveShowDataPromise;

  saveShowDataPromise = (async (): Promise<ShowSaveResult> => {
    // 本地先落盘，保证离线可用
    saveLocalShowData(uniqueData);

    if (!isSupabaseConfigured()) {
      return { error: null, conflicts };
    }

    const BATCH_SIZE = 20;
    const rows = uniqueData.map(toDbRow);

    // 分批 upsert
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("shows").upsert(batch, { onConflict: "id" });
      if (error) {
        return {
          error: `保存批次 ${Math.floor(i / BATCH_SIZE) + 1} 失败: ${error.message}`,
          conflicts,
        };
      }
    }

    recordSyncTime();

    // 删除云端多余行
    if (uniqueData.length === 0) {
      return { error: null, conflicts };
    }
    const currentIds = new Set(uniqueData.map((d) => d.id));
    const { data: remoteRows, error: fetchErr } = await supabase
      .from("shows")
      .select("id")
      .limit(9995);
    if (fetchErr) {
      return { error: null, conflicts };
    }

    const idsToDelete = (remoteRows || [])
      .filter((r: any) => !currentIds.has(String(r.id)))
      .map((r: any) => String(r.id));

    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const batch = idsToDelete.slice(i, i + BATCH_SIZE);
      const { error: delError } = await supabase.from("shows").delete().in("id", batch);
      if (delError && import.meta.env.DEV) {
        console.warn("[shows] delete batch failed:", delError.message);
      }
    }

    return { error: null, conflicts };
  })();

  const result = await saveShowDataPromise;
  saveShowDataPromise = null;
  return result;
}

export async function addShowItem(item: ShowItem): Promise<ShowSaveResult> {
  let current = loadShowData();
  if (current.length === 0) {
    current = await syncShowData();
  }
  const updated = [...current, item];
  return saveShowData(updated);
}

export async function updateShowItem(item: ShowItem): Promise<ShowSaveResult> {
  let current = loadShowData();
  if (current.length === 0) {
    current = await syncShowData();
  }
  const updated = current.map((s) => (s.id === item.id ? item : s));
  return saveShowData(updated);
}

export async function deleteShowItem(id: string): Promise<{ error: string | null }> {
  const current = loadShowData();
  const updated = current.filter((s) => s.id !== id);
  saveLocalShowData(updated);
  if (!isSupabaseConfigured()) return { error: null };
  const { error } = await supabase.from("shows").delete().eq("id", id);
  if (error) {
    // 云端删除失败，恢复本地
    saveLocalShowData(current);
    return { error: error.message };
  }
  return { error: null };
}

/** 将当前 localStorage 中的数据批量导入 Supabase */
export async function migrateShowsToSupabase(): Promise<{ success: number; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { success: 0, error: "Supabase 未配置" };
  }
  const items = loadShowData();
  if (items.length === 0) return { success: 0, error: null };
  const { error } = await supabase.from("shows").upsert(items.map(toDbRow), { onConflict: "id" });
  if (error) return { success: 0, error: error.message };
  return { success: items.length, error: null };
}

export const memberColors: Record<ShowMember, string> = {
  任炫植: "bg-sky-100 text-sky-700 border-sky-200",
  徐恩光: "bg-yellow-100 text-yellow-700 border-yellow-200",
  李旼赫: "bg-rose-100 text-rose-700 border-rose-200",
  李昌燮: "bg-green-100 text-green-700 border-green-200",
  Peniel: "bg-blue-100 text-blue-700 border-blue-200",
  陆星材: "bg-indigo-100 text-indigo-700 border-indigo-200",
  BTOB: "bg-[#d3effe] text-[#43b4e6] border-[#43b4e6]",
  BCOM组: "bg-white text-gray-900 border-gray-900",
};

// ==================== YouTube / Bilibili 辅助函数 ====================

/** 从 YouTube URL 中提取视频 ID */
export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const clean = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
  const match = clean.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/
  );
  return match?.[1] ?? null;
}

/** 从 Bilibili URL 中提取 BV/av 号 */
export function extractBilibiliId(url: string): string | null {
  if (!url) return null;
  const clean = url.trim();
  const bvMatch = clean.match(
    /(?:bilibili\.com\/video\/|b23\.tv\/|m\.bilibili\.com\/video\/)(BV[a-zA-Z0-9]+)/i
  );
  if (bvMatch) return bvMatch[1];
  const avMatch = clean.match(/(?:bilibili\.com\/video\/|b23\.tv\/)(av\d+)/i);
  return avMatch?.[1] ?? null;
}

/** 获取 YouTube 缩略图 URL */
export function getYouTubeThumbnail(url: string): string | null {
  const id = extractYouTubeId(url);
  if (!id) return null;
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

/** 获取高分辨率 YouTube 缩略图 */
export function getYouTubeThumbnailHD(url: string): string | null {
  const id = extractYouTubeId(url);
  if (!id) return null;
  return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
}

/** 判断链接是否为 YouTube */
export function isYouTubeLink(url: string): boolean {
  return /youtube\.com|youtu\.be/.test(url);
}

/** 判断链接是否为 Bilibili */
export function isBilibiliLink(url: string): boolean {
  return /bilibili\.com|b23\.tv/.test(url);
}

/**
 * 获取优先封面（同步，仅用于已缓存的元数据或 YouTube 缩略图）。
 * 优先 YouTube，其次已缓存的 Bilibili 封面，都没有则返回 null（使用渐变）。
 */
export function getPreferredThumbnail(item: ShowItem): string | null {
  // 如果 thumbnailFrom 是真实封面 URL，优先使用
  if (item.thumbnailFrom && /^https?:\/\//.test(item.thumbnailFrom)) {
    return item.thumbnailFrom;
  }

  // 优先从缓存元数据获取（Worker 抓取的真实缩略图，包含直播封面）
  const cachedMeta = getCachedMetadata(item.id);
  if (cachedMeta?.thumbnail) {
    return cachedMeta.thumbnail;
  }

  // 其次从 YouTube 链接生成缩略图
  for (const link of item.links) {
    if (isYouTubeLink(link.url)) {
      const thumb = getYouTubeThumbnailHD(link.url);
      if (thumb) return thumb;
      const thumbHq = getYouTubeThumbnail(link.url);
      if (thumbHq) return thumbHq;
    }
  }

  return null;
}

/** 获取优先数据来源标记 */
export function getPreferredSource(item: ShowItem): string | null {
  const hasYouTube = item.links.some((l) => isYouTubeLink(l.url));
  if (hasYouTube) return "YouTube";
  const hasBilibili = item.links.some((l) => isBilibiliLink(l.url));
  if (hasBilibili) return "Bilibili";
  return null;
}

// ==================== 元数据抓取与缓存 ====================

/** 构建时预取的视频元数据（YouTube 页面爬取 + Bilibili API） */
import videoPreFetchRaw from "@/data/video-meta.json";
const videoPreFetch = videoPreFetchRaw as Record<string, VideoMetadata>;
import { fetchVideoInfo } from "@/lib/videoFetcher";

const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

/** 24 小时的毫秒数 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface MetadataCache {
  [itemId: string]: VideoMetadata;
}

function loadMetadataCache(): MetadataCache {
  // 检查缓存版本，版本不匹配则清空旧缓存
  try {
    const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);
    if (storedVersion !== CACHE_VERSION) {
      localStorage.removeItem(META_CACHE_KEY);
      localStorage.setItem(CACHE_VERSION_KEY, CACHE_VERSION);
      return {};
    }
  } catch {
    // ignore
  }

  try {
    const raw = localStorage.getItem(META_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

function saveMetadataCache(cache: MetadataCache): void {
  try {
    localStorage.setItem(META_CACHE_KEY, JSON.stringify(cache));
    localStorage.setItem(CACHE_VERSION_KEY, CACHE_VERSION);
  } catch {
    // ignore
  }
}

/** 获取已缓存的元数据（不发起请求） */
export function getCachedMetadata(itemId: string): VideoMetadata | null {
  const cache = loadMetadataCache();
  if (cache[itemId]) return cache[itemId];

  // 从当前本地数据中查找对应条目，回退到预取元数据
  const item = loadShowData().find((s) => s.id === itemId);
  if (item) {
    for (const link of item.links) {
      if (isYouTubeLink(link.url)) {
        const videoId = extractYouTubeId(link.url);
        if (videoId) {
          const preKey = "yt:" + videoId;
          const preFetched = videoPreFetch[preKey];
          if (preFetched) {
            // 预取数据视为新鲜缓存，更新 fetchedAt 为当前时间
            return { ...preFetched, fetchedAt: Date.now() };
          }
        }
      } else if (isBilibiliLink(link.url)) {
        const bvid = extractBilibiliId(link.url);
        if (bvid) {
          const preKey = "bl:" + bvid;
          const preFetched = videoPreFetch[preKey];
          if (preFetched) {
            // 预取数据视为新鲜缓存，更新 fetchedAt 为当前时间
            return { ...preFetched, fetchedAt: Date.now() };
          }
        }
      }
    }
  }

  return null;
}

/** 检查缓存是否需要刷新（超过 24 小时则需刷新） */
export function isCacheStale(meta: VideoMetadata | null): boolean {
  if (!meta) return true;
  return Date.now() - meta.fetchedAt > ONE_DAY_MS;
}

/** 解析 ISO 8601 时长格式（如 PT1H15M30S）为秒数 */
function parseISODuration(iso: string): number | null {
  if (!iso || typeof iso !== "string") return null;
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  return h * 3600 + m * 60 + s;
}

/** 将秒数转为人类可读的时长，如 "1:15:00" */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
/** 将播放量数字转为人类可读格式，如 "280万" */
function formatViews(views: number): string {
  if (views >= 100000000) {
    return `${(views / 100000000).toFixed(1).replace(/\.0$/, "")}亿`;
  }
  if (views >= 10000) {
    return `${(views / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  }
  return views.toLocaleString();
}

/**
 * 从 Bilibili API 抓取视频元数据（封面、时长、播放量、发布时间）。
 *
 * 数据源优先级：
 * 1. 构建时预取数据（最可靠，Node.js 直连 Bilibili API）
 * 2. 开发模式：Vite 代理（/api/bilibili/ → api.bilibili.com，无 CORS）
 * 3. 生产模式：CORS 代理（大概率失败，预取数据兜底）
 */
async function fetchBilibiliMetadata(bvid: string): Promise<VideoMetadata | null> {
  // ① 构建时预取数据 — 最可靠
  const preKey = `bl:${bvid}`;
  const preFetched = videoPreFetch[preKey];
  if (preFetched?.thumbnail && preFetched?.fetchedAt) {
    return {
      title: preFetched.title || undefined,
      thumbnail: preFetched.thumbnail,
      duration: preFetched.duration || undefined,
      views: preFetched.views || undefined,
      publishedAt: preFetched.publishedAt || undefined,
      source: "Bilibili",
      fetchedAt: preFetched.fetchedAt,
    };
  }

  // ② 开发模式：通过 Vite 代理直连 Bilibili API
  if (import.meta.env.DEV) {
    try {
      const resp = await fetch(`/api/bilibili/x/web-interface/view?bvid=${bvid}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.code === 0 && data?.data) {
          const d = data.data;
          const pubDate = d.pubdate ? new Date(d.pubdate * 1000).toISOString().split("T")[0] : undefined;
          return {
            thumbnail: d.pic || undefined,
            duration: d.duration ? formatDuration(d.duration) : undefined,
            views: d.stat?.view != null ? formatViews(d.stat.view) : undefined,
            publishedAt: pubDate,
            source: "Bilibili",
            fetchedAt: Date.now(),
          };
        }
      }
    } catch {
      // 代理失败，继续尝试 CORS 代理
    }
  }

  // ③ 生产模式兜底：CORS 代理
  const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  for (const proxy of CORS_PROXIES) {
    try {
      const resp = await fetch(proxy(apiUrl), {
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data?.code !== 0 || !data?.data) continue;
      const d = data.data;
      const pubDate = d.pubdate ? new Date(d.pubdate * 1000).toISOString().split("T")[0] : undefined;
      return {
        thumbnail: d.pic || undefined,
        duration: d.duration ? formatDuration(d.duration) : undefined,
        views: d.stat?.view != null ? formatViews(d.stat.view) : undefined,
        publishedAt: pubDate,
        source: "Bilibili",
        fetchedAt: Date.now(),
      };
    } catch {
      // try next proxy
    }
  }
  return null;
}

/**
 * 从 YouTube 获取视频元数据。
 *
 * 复用 videoFetcher.ts 的完整抓取管线：
 * 预取数据 → YouTube Data API v3（需 Key）→ 页面爬取（JSON-LD，无 Key 也能获取播放量）
 * → oEmbed 降级（仅标题+封面）
 */
async function fetchYouTubeMetadata(videoId: string): Promise<VideoMetadata | null> {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await fetchVideoInfo(watchUrl);
    // 只有当 fetchVideoInfo 返回有效标题时，才视为成功
    if (!info.title) {
      if (import.meta.env.DEV) console.warn(`[youtube] ${videoId}: fetchVideoInfo returned empty title`);
      return null;
    }
    return {
      title: info.title,
      thumbnail: info.thumbnail || undefined,
      duration: info.durationFormatted || undefined,
      views: info.viewCountFormatted || undefined,
      publishedAt: info.publishedAt || undefined,
      source: "YouTube",
      fetchedAt: Date.now(),
    };
  } catch (e) {
    if (import.meta.env.DEV) console.warn(`[youtube] ${videoId}: fetchVideoInfo failed`, e);
    return null;
  }
}

/**
 * 抓取单个综艺条目的元数据。
 * 优先 YouTube（缩略图可直接获取；时长/播放量因无 API Key 无法获取，保留手动数据），
 * 其次 Bilibili（通过 API 获取封面、时长、播放量）。
 *
 * @param item 综艺条目
 * @param forceRefresh 是否强制刷新（忽略缓存有效期）
 */
export async function fetchShowMetadata(
  item: ShowItem,
  forceRefresh = false
): Promise<VideoMetadata | null> {
  const cache = loadMetadataCache();
  const cached = cache[item.id];

  // 缓存仍然有效，直接返回
  if (!forceRefresh && cached && !isCacheStale(cached)) {
    return cached;
  }

  // ========== 优先走服务端 API（支持管理员强制刷新）==========
  const videoId = extractYouTubeId(item.links.find((l) => isYouTubeLink(l.url))?.url || "");
  if (videoId) {
    try {
      const url = forceRefresh
        ? `/api/youtube-meta?videoId=${videoId}&adminRefresh=true`
        : `/api/youtube-meta?videoId=${videoId}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json();
        if (!data.error && data.title) {
          // 服务端返回有效数据，解析并保存
          const apiSeconds = data.lengthSeconds || parseISODuration(data.duration) || 0;
          const result: VideoMetadata = {
            title: data.title,
            thumbnail: data.thumbnail || undefined,
            duration: apiSeconds > 0 ? formatDuration(apiSeconds) : undefined,
            lengthSeconds: apiSeconds > 0 ? apiSeconds : undefined,
            views: data.viewCount > 0 ? formatViews(data.viewCount) : undefined,
            publishedAt: data.publishedAt || undefined,
            source: "YouTube",
            fetchedAt: Date.now(),
          };
          cache[item.id] = result;
          saveMetadataCache(cache);
          return result;
        }
      }
    } catch (e) {
      if (import.meta.env.DEV) console.log("API fetch failed:", e);
    }
  }

  // ========== 降级：本地抓取（Bilibili / YouTube 页面爬取）==========
  let result: VideoMetadata | null = null;

  // 优先 YouTube
  for (const link of item.links) {
    if (isYouTubeLink(link.url)) {
      const vid = extractYouTubeId(link.url);
      if (vid) {
        result = await fetchYouTubeMetadata(vid);
        if (result) break;
      }
    }
  }

  // Bilibili 补充
  const bilibiliLink = item.links.find((l) => isBilibiliLink(l.url));
  if (bilibiliLink) {
    const bvid = extractBilibiliId(bilibiliLink.url);
    if (bvid) {
      const biliMeta = await fetchBilibiliMetadata(bvid);
      if (biliMeta) {
        if (!result) {
          result = biliMeta;
        } else {
          result = {
            ...result,
            duration: result.duration || biliMeta.duration,
            views: result.views || biliMeta.views,
            publishedAt: result.publishedAt || biliMeta.publishedAt,
            source: "YouTube + Bilibili",
          };
        }
      }
    }
  }

  if (result) {
    cache[item.id] = result;
    saveMetadataCache(cache);
    return result;
  }

  // 重新抓取失败时，返回已过期的缓存数据
  return cached || null;
}

/**
 * 批量抓取所有综艺条目的元数据。
 * 返回更新后的元数据缓存。
 */
export async function fetchAllShowMetadata(
  items: ShowItem[],
  onProgress?: (itemId: string, meta: VideoMetadata | null) => void
): Promise<void> {
  for (const item of items) {
    const meta = await fetchShowMetadata(item);
    if (onProgress) onProgress(item.id, meta);
  }
}

/** 统一将各种时长格式转为 HH:MM:SS 或 MM:SS */
function normalizeDuration(raw: string): string | null {
  const trimmed = raw.trim();

  // 已经是标准数字格式，直接返回
  if (/^\d+:\d{2}(:\d{2})?$/.test(trimmed)) {
    return trimmed;
  }

  // ISO 8601 格式：PT1H15M30S / PT48M / PT35S
  const isoSeconds = parseISODuration(trimmed);
  if (isoSeconds !== null && isoSeconds > 0) {
    return formatDuration(isoSeconds);
  }

  // 中文格式："1小时15分30秒" / "1小时15分" / "15分30秒" / "30秒"
  const hMatch = trimmed.match(/(\d+)\s*小时?/);
  const mMatch = trimmed.match(/(\d+)\s*分/);
  const sMatch = trimmed.match(/(\d+)\s*秒/);

  const h = hMatch ? parseInt(hMatch[1], 10) : 0;
  const m = mMatch ? parseInt(mMatch[1], 10) : 0;
  const s = sMatch ? parseInt(sMatch[1], 10) : 0;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  if (m > 0 || s > 0) {
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  return null;
}

/** 获取展示用的时长：优先缓存的 API 数据（自动刷新），其次手动数据 */
export function getDisplayDuration(item: ShowItem): string {
  // 优先使用 Supabase 中的最新数据
  if (item.duration) {
    const normalized = normalizeDuration(item.duration);
    if (normalized) return normalized;
  }

  // 降级到本地缓存
  const meta = getCachedMetadata(item.id);
  if (meta?.lengthSeconds && meta.lengthSeconds > 0) {
    return formatDuration(meta.lengthSeconds);
  }
  if (meta?.duration) {
    const normalized = normalizeDuration(meta.duration);
    if (normalized) return normalized;
  }

  return item.duration || "未知时长";
}

/** 获取展示用的播放量：优先缓存的 API 数据（自动刷新），其次手动数据 */
export function getDisplayViews(item: ShowItem): string {
  // 优先使用 Supabase 中的最新数据（Worker Cron 已更新）
  if (item.views && item.views !== "0") return item.views;
  // 降级到本地缓存
  const meta = getCachedMetadata(item.id);
  if (meta?.views) return meta.views;
  return "0";
}

/** 获取展示用的发布日期：优先缓存的 API 数据（自动刷新），其次手动数据 */
export function getDisplayDate(item: ShowItem): string {
  // 优先使用 Supabase 中的最新数据
  if (item.date && item.date.includes("T")) {
    return item.date.split("T")[0];
  }
  if (item.date) return item.date;

  // 降级到本地缓存
  const meta = getCachedMetadata(item.id);
  if (meta?.publishedAt) {
    return meta.publishedAt.split("T")[0];
  }

  return "";
}

/** 平台图标颜色映射 */
export const platformStyles: Record<string, { bg: string; text: string; icon: string }> = {
  YouTube: { bg: "bg-red-500", text: "text-white", icon: "▶" },
  Bilibili: { bg: "bg-pink-500", text: "text-white", icon: "📺" },
  "V LIVE": { bg: "bg-indigo-500", text: "text-white", icon: "🎥" },
  Weverse: { bg: "bg-blue-500", text: "text-white", icon: "💎" },
  "NAVER NOW": { bg: "bg-green-500", text: "text-white", icon: "📻" },
  其他: { bg: "bg-gray-500", text: "text-white", icon: "🔗" },
};

/**
 * 将缓存的视频元数据应用到 ShowItem 数据上。
 * 管理员点击「刷新数据」后调用此函数，把抓取到的发布日期、时长、播放量写回条目。
 */
export function applyCachedMetadataToItems(items: ShowItem[]): ShowItem[] {
  return items.map((item) => {
    const meta = getCachedMetadata(item.id);
    if (!meta) return item;
    return {
      ...item,
      date: meta.publishedAt || item.date,
      duration: meta.duration || item.duration,
      views: meta.views && meta.views !== "0" ? meta.views : item.views,
    };
  });
}

export function getPlatformStyle(platform: string) {
  return platformStyles[platform] || platformStyles["其他"];
}

// ==================== 实时同步 ====================

/** 订阅 shows 表实时变更（INSERT / UPDATE / DELETE） */
export function subscribeShowChanges(onChange: (items: ShowItem[]) => void): () => void {
  if (!isSupabaseConfigured()) return () => {};
  const channel = supabase
    .channel("shows_realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "shows" }, async () => {
      if (import.meta.env.DEV) console.log("[realtime] shows updated");
      const fresh = await syncShowData();
      onChange(fresh);
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** 检查远程是否有更新，有则同步并返回新数据 */
export async function checkRemoteUpdates(): Promise<ShowItem[] | null> {
  if (!isSupabaseConfigured()) return null;
  const { count, error } = await supabase.from("shows").select("*", { count: "exact", head: true });
  if (error) return null;
  if (count !== null && count !== loadShowData().length) {
    if (import.meta.env.DEV) console.log("[sync] remote count changed, refreshing...");
    return syncShowData();
  }
  // 每 5 分钟强制全量对比一次（防止删一条加一条导致 count 不变）
  const lastFullSync = parseInt(localStorage.getItem("hsik_shows_full_sync") || "0", 10);
  if (Date.now() - lastFullSync > 5 * 60 * 1000) {
    localStorage.setItem("hsik_shows_full_sync", Date.now().toString());
    return syncShowData();
  }
  return null;
}

// ==================== 服务端元数据刷新 ====================

/**
 * 立即刷新单个视频的元数据（调用 Worker）
 * 用于管理员添加/更新视频后，立即获取最新播放量
 */
export async function refreshSingleShowMetadata(
  item: ShowItem
): Promise<{ error: string | null; metadata?: any }> {
  const youtubeLink = item.links.find((l) => isYouTubeLink(l.url));
  const bilibiliLink = item.links.find((l) => isBilibiliLink(l.url));

  if (!youtubeLink && !bilibiliLink) {
    return { error: null };
  }

  try {
    const videoId = youtubeLink ? extractYouTubeId(youtubeLink.url) : null;
    const bvid = bilibiliLink ? extractBilibiliId(bilibiliLink.url) : null;

    const params = new URLSearchParams();
    params.append("showId", item.id);
    if (videoId) params.append("videoId", videoId);
    if (bvid) params.append("bvid", bvid);

    const resp = await fetch(`/api/refresh-show?${params.toString()}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) {
      return { error: `刷新失败: HTTP ${resp.status}` };
    }

    const data = await resp.json();
    if (data.error) {
      return { error: data.error };
    }

    return { error: null, metadata: data.metadata };
  } catch (e) {
    return { error: String(e) };
  }
}

/**
 * 批量刷新所有视频的元数据（调用 Worker）
 * 用于批量导入后，或 Cron 触发后前端手动刷新
 */
export async function batchRefreshMetadata(): Promise<{ error: string | null; updated?: number }> {
  try {
    const resp = await fetch("/api/refresh-all-shows", {
      method: "POST",
      signal: AbortSignal.timeout(120000),
    });
    if (!resp.ok) {
      return { error: `批量刷新失败: HTTP ${resp.status}` };
    }
    const data = await resp.json();
    return { error: null, updated: data.updated };
  } catch (e) {
    return { error: String(e) };
  }
}
