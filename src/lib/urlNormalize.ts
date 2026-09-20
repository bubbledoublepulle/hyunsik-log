/**
 * 视频 URL 规范化与去重。
 * 统一 YouTube / Bilibili 多种 URL 格式为规范形式与去重键。
 */

export type VideoPlatform = "youtube" | "bilibili" | "unknown";

export interface NormalizedVideoRef {
  platform: "youtube" | "bilibili";
  /** YouTube: 11 位 videoId；Bilibili: BV 号或 av 号 */
  videoKey: string;
  /** 去重键，如 "yt:dQw4w9WgXcQ" / "bl:BV1xx411c7mD" */
  dedupeKey: string;
  /** 规范化后的 URL，落库统一用这个 */
  canonicalUrl: string;
}

export interface DedupeOutcome {
  /** 新增：dedupeKey -> ref（同一批内也已去重） */
  fresh: { ref: NormalizedVideoRef; rawUrl: string }[];
  /** 与既有档案重复 */
  duplicates: { ref: NormalizedVideoRef; rawUrl: string; existingShowId: string }[];
  /** 无法解析 */
  unparsable: string[];
}

const YT_PATTERNS = [
  /(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#]*?[&?])v=([a-zA-Z0-9_-]{11})/,
  /(?:www\.|m\.)?youtube\.com\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})/,
  /youtu\.be\/([a-zA-Z0-9_-]{11})/,
];

const BILI_BV_PATTERNS = [
  /(?:www\.|m\.)?bilibili\.com\/video\/(BV[a-zA-Z0-9]{8,12})/i,
  /b23\.tv\/(BV[a-zA-Z0-9]{8,12})/i,
];

const BILI_AV_PATTERNS = [
  /(?:www\.|m\.)?bilibili\.com\/video\/av(\d+)/i,
  /b23\.tv\/av(\d+)/i,
];

/** 规范化单条 URL；无法识别返回 null */
export function normalizeVideoUrl(raw: string): NormalizedVideoRef | null {
  const s = raw.trim();
  if (!s) return null;

  // 裸 YouTube videoId（11 位）
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) {
    return {
      platform: "youtube",
      videoKey: s,
      dedupeKey: `yt:${s}`,
      canonicalUrl: `https://www.youtube.com/watch?v=${s}`,
    };
  }

  for (const re of YT_PATTERNS) {
    const m = s.match(re);
    if (m?.[1]) {
      const id = m[1];
      return {
        platform: "youtube",
        videoKey: id,
        dedupeKey: `yt:${id}`,
        canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
      };
    }
  }

  for (const re of BILI_BV_PATTERNS) {
    const m = s.match(re);
    if (m?.[1]) {
      const bv = m[1].toUpperCase();
      return {
        platform: "bilibili",
        videoKey: bv,
        dedupeKey: `bl:${bv}`,
        canonicalUrl: `https://www.bilibili.com/video/${bv}`,
      };
    }
  }

  for (const re of BILI_AV_PATTERNS) {
    const m = s.match(re);
    if (m?.[1]) {
      const av = `av${m[1]}`;
      return {
        platform: "bilibili",
        videoKey: av,
        dedupeKey: `bl:${av}`,
        canonicalUrl: `https://www.bilibili.com/video/av${m[1]}`,
      };
    }
  }

  return null;
}

export function detectPlatform(raw: string): VideoPlatform {
  const r = normalizeVideoUrl(raw);
  if (r) return r.platform;
  if (/youtube\.com|youtu\.be/.test(raw)) return "youtube";
  if (/bilibili\.com|b23\.tv/.test(raw)) return "bilibili";
  return "unknown";
}

/** 从既有档案构建 dedupeKey -> showId 索引 */
export function buildExistingIndex(
  items: { id: string; links?: { url: string }[]; link?: string }[]
): Map<string, string> {
  const idx = new Map<string, string>();
  for (const it of items) {
    const urls = [...(it.links ?? []).map((l) => l.url), it.link ?? ""].filter(Boolean);
    for (const u of urls) {
      const r = normalizeVideoUrl(u);
      if (r && !idx.has(r.dedupeKey)) idx.set(r.dedupeKey, it.id);
    }
  }
  return idx;
}

export function dedupeUrls(
  rawUrls: string[],
  existing: Map<string, string>
): DedupeOutcome {
  const seen = new Set<string>();
  const out: DedupeOutcome = { fresh: [], duplicates: [], unparsable: [] };
  for (const raw of rawUrls) {
    const ref = normalizeVideoUrl(raw);
    if (!ref) {
      out.unparsable.push(raw);
      continue;
    }
    if (seen.has(ref.dedupeKey)) {
      out.duplicates.push({ ref, rawUrl: raw, existingShowId: "(本批次内重复)" });
      continue;
    }
    seen.add(ref.dedupeKey);
    const hit = existing.get(ref.dedupeKey);
    if (hit) out.duplicates.push({ ref, rawUrl: raw, existingShowId: hit });
    else out.fresh.push({ ref, rawUrl: raw });
  }
  return out;
}

/** 仅用于向后兼容：从 URL 提取 YouTube videoId */
export function extractYouTubeId(raw: string): string | null {
  return normalizeVideoUrl(raw)?.platform === "youtube"
    ? normalizeVideoUrl(raw)!.videoKey
    : null;
}

/** 仅用于向后兼容：从 URL 提取 Bilibili BV/av 号 */
export function extractBilibiliId(raw: string): string | null {
  const r = normalizeVideoUrl(raw);
  return r?.platform === "bilibili" ? r.videoKey : null;
}
