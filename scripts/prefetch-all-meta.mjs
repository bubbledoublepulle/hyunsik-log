/**
 * 构建时预取 YouTube + Bilibili 视频元数据（封面、发布时间、播放量、时长）。
 * Node.js 环境无 CORS 限制，可直连 Bilibili API 和 YouTube 页面。
 *
 * 用法: node scripts/prefetch-all-meta.mjs
 * 输出: src/data/video-meta.json
 *
 * 环境变量:
 *   SUPABASE_URL          - Supabase 项目 URL
 *   SUPABASE_SERVICE_KEY  - 服务角色密钥（推荐，可绕过 RLS）
 *   SUPABASE_ANON_KEY     - 匿名密钥（若 shows 表对匿名用户可读）
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUTPUT = resolve(ROOT, "src/data/video-meta.json");

// ==================== 工具函数 ====================

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}小时${m}分`;
  if (m > 0) return `${m}分${s > 0 ? s + "秒" : ""}`;
  return `${s}秒`;
}

function formatViews(views) {
  if (views >= 100000000) {
    return `${(views / 100000000).toFixed(1).replace(/\.0$/, "")}亿`;
  }
  if (views >= 10000) {
    return `${(views / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  }
  return views.toLocaleString();
}

function extractYouTubeId(url) {
  if (!url) return null;
  const clean = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
  const match = clean.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/
  );
  return match?.[1] ?? null;
}

function extractBilibiliId(url) {
  if (!url) return null;
  const clean = url.trim();
  const bvMatch = clean.match(
    /(?:bilibili\.com\/video\/|b23\.tv\/|m\.bilibili\.com\/video\/)(BV[a-zA-Z0-9]+)/i
  );
  if (bvMatch) return bvMatch[1];
  const avMatch = clean.match(/(?:bilibili\.com\/video\/|b23\.tv\/)(av\d+)/i);
  return avMatch?.[1] ?? null;
}

// ==================== Supabase 配置 ====================

function loadSupabaseConfig() {
  const envUrl = process.env.SUPABASE_URL;
  const envKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (envUrl && envKey) {
    return { url: envUrl, key: envKey };
  }

  const supabasePath = resolve(ROOT, "src/lib/supabase.ts");
  if (!existsSync(supabasePath)) {
    return { url: envUrl, key: envKey };
  }

  const content = readFileSync(supabasePath, "utf-8");
  const urlMatch = content.match(/const\s+SUPABASE_URL\s*=\s*import\.meta\.env\.VITE_SUPABASE_URL\s*\|\|\s*["']([^"']+)["']/);
  const keyMatch = content.match(/const\s+SUPABASE_KEY\s*=\s*import\.meta\.env\.VITE_SUPABASE_ANON_KEY\s*\|\|\s*["']([^"']+)["']/);

  return {
    url: envUrl || urlMatch?.[1],
    key: envKey || keyMatch?.[1],
  };
}

async function fetchAllShows(supabaseUrl, supabaseKey) {
  const all = [];
  let from = 0;
  const PAGE_SIZE = 100;
  while (true) {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/shows?select=*&order=created_at.desc&limit=${PAGE_SIZE}&offset=${from}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );
    if (!resp.ok) {
      throw new Error(`Supabase 读取失败: HTTP ${resp.status}`);
    }
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

// ==================== YouTube 数据抓取 ====================

const YOUTUBE_API_KEY = process.env.VITE_YOUTUBE_API_KEY;

function parseISODuration(iso) {
  if (!iso || typeof iso !== "string") return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  return h * 3600 + m * 60 + s;
}

async function fetchYouTubeMetaByAPI(videoIds) {
  if (!YOUTUBE_API_KEY || videoIds.length === 0) return [];
  const url =
    "https://www.googleapis.com/youtube/v3/videos" +
    `?part=snippet,statistics,contentDetails&id=${videoIds.join(",")}&key=${YOUTUBE_API_KEY}`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!resp.ok) {
      console.error(`  ❌ YouTube API 批量请求失败: HTTP ${resp.status}`);
      return [];
    }
    const data = await resp.json();
    return (data.items || []).map((item) => {
      const snippet = item.snippet || {};
      const stats = item.statistics || {};
      const content = item.contentDetails || {};
      const lengthSeconds = parseISODuration(content.duration);
      const viewCount = parseInt(stats.viewCount) || 0;
      const thumbnails = snippet.thumbnails || {};
      const thumbnail =
        thumbnails.maxres?.url ||
        thumbnails.standard?.url ||
        thumbnails.high?.url ||
        thumbnails.medium?.url ||
        `https://img.youtube.com/vi/${item.id}/maxresdefault.jpg`;
      return {
        id: item.id,
        title: snippet.title || "",
        thumbnail,
        duration: lengthSeconds > 0 ? formatDuration(lengthSeconds) : "",
        views: viewCount > 0 ? formatViews(viewCount) : "",
        publishedAt: snippet.publishedAt ? snippet.publishedAt.split("T")[0] : "",
        source: "YouTube",
        fetchedAt: Date.now(),
      };
    });
  } catch (e) {
    console.error(`  ❌ YouTube API 批量请求异常: ${e.message}`);
    return [];
  }
}

async function fetchYouTubeMeta(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      console.error(`  ❌ YouTube ${videoId}: HTTP ${resp.status}`);
      return null;
    }
    const html = await resp.text();

    const match = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!match) {
      console.error(`  ❌ YouTube ${videoId}: 未找到 ytInitialPlayerResponse`);
      return null;
    }

    const playerData = JSON.parse(match[1]);
    const videoDetails = playerData.videoDetails || {};
    const microformat = playerData.microformat?.playerMicroformatRenderer || {};

    const title = videoDetails.title || "";
    const lengthSeconds = parseInt(videoDetails.lengthSeconds) || 0;
    const viewCount = parseInt(videoDetails.viewCount) || 0;
    const publishDate = microformat.publishDate || "";

    const thumbnails = videoDetails.thumbnail?.thumbnails || [];
    const thumbnail =
      thumbnails.length > 0
        ? thumbnails[thumbnails.length - 1].url
        : `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    const result = {
      title,
      thumbnail,
      duration: lengthSeconds > 0 ? formatDuration(lengthSeconds) : "",
      views: viewCount > 0 ? formatViews(viewCount) : "",
      publishedAt: publishDate ? publishDate.split("T")[0] : "",
      source: "YouTube",
      fetchedAt: Date.now(),
    };

    console.log(
      `  ✅ YouTube ${videoId}: "${title}" — 日期=${result.publishedAt}, 时长=${result.duration}, 播放=${result.views}`
    );
    return result;
  } catch (e) {
    console.error(`  ❌ YouTube ${videoId}: ${e.message}`);
    return null;
  }
}

// ==================== Bilibili 数据抓取 ====================

async function fetchBilibiliMeta(bvid) {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: "https://www.bilibili.com/",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      console.error(`  ❌ Bilibili ${bvid}: HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (data?.code !== 0 || !data?.data) {
      console.error(
        `  ❌ Bilibili ${bvid}: API code=${data?.code}, message=${data?.message}`
      );
      return null;
    }
    const d = data.data;
    const pubDate = d.pubdate
      ? new Date(d.pubdate * 1000).toISOString().split("T")[0]
      : "";

    let thumbnail = d.pic || "";
    if (thumbnail.startsWith("//")) thumbnail = `https:${thumbnail}`;

    const result = {
      title: d.title || "",
      thumbnail,
      duration: d.duration ? formatDuration(d.duration) : "",
      views: d.stat?.view != null ? formatViews(d.stat.view) : "",
      publishedAt: pubDate,
      source: "Bilibili",
      fetchedAt: Date.now(),
    };

    console.log(
      `  ✅ Bilibili ${bvid}: "${d.title}" — 日期=${result.publishedAt}, 时长=${result.duration}, 播放=${result.views}`
    );
    return result;
  } catch (e) {
    console.error(`  ❌ Bilibili ${bvid}: ${e.message}`);
    return null;
  }
}

// ==================== 主流程 ====================

async function main() {
  console.log("=== 视频元数据预取 (YouTube + Bilibili) ===\n");

  const config = loadSupabaseConfig();
  if (!config.url || !config.key) {
    console.warn("⚠️ 未配置 Supabase 环境变量，跳过预取，保留现有 video-meta.json");
    process.exit(0);
  }

  let shows = [];
  try {
    shows = await fetchAllShows(config.url, config.key);
    console.log(`从 Supabase 读取到 ${shows.length} 条综艺档案\n`);
  } catch (e) {
    console.error("❌ 读取 Supabase 失败:", e.message);
    console.log("保留现有 video-meta.json");
    process.exit(0);
  }

  const ytIds = new Set();
  const bvids = new Set();

  for (const show of shows) {
    const links = show.links || [];
    if (show.link) {
      links.push({ platform: "unknown", url: show.link });
    }
    for (const link of links) {
      const u = link?.url || "";
      const ytId = extractYouTubeId(u);
      if (ytId) ytIds.add(ytId);
      const bvid = extractBilibiliId(u);
      if (bvid) bvids.add(bvid);
    }
  }

  const ytIdList = [...ytIds];
  const bvidList = [...bvids];
  console.log(`发现 ${ytIdList.length} 个 YouTube 视频ID: ${ytIdList.join(", ") || "无"}`);
  console.log(`发现 ${bvidList.length} 个 Bilibili BV号: ${bvidList.join(", ") || "无"}`);

  const metaMap = {};

  // ① 抓取 YouTube 数据：优先批量 API，失败再降级单条页面解析
  console.log("\n--- YouTube ---");
  if (YOUTUBE_API_KEY) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < ytIdList.length; i += BATCH_SIZE) {
      const batch = ytIdList.slice(i, i + BATCH_SIZE);
      console.log(`  批量请求 ${i + 1}-${Math.min(i + BATCH_SIZE, ytIdList.length)} / ${ytIdList.length}`);
      const metas = await fetchYouTubeMetaByAPI(batch);
      for (const meta of metas) {
        metaMap[`yt:${meta.id}`] = meta;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // 对 API 未命中的 ID，降级单条页面解析
  for (const videoId of ytIdList) {
    if (metaMap[`yt:${videoId}`]) continue;
    const meta = await fetchYouTubeMeta(videoId);
    if (meta) {
      metaMap[`yt:${videoId}`] = meta;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  // ② 抓取 Bilibili 数据
  console.log("\n--- Bilibili ---");
  for (const bvid of bvidList) {
    const meta = await fetchBilibiliMeta(bvid);
    if (meta) {
      metaMap[`bl:${bvid}`] = meta;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // 确保输出目录存在
  const outDir = dirname(OUTPUT);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  // 写入 JSON
  writeFileSync(OUTPUT, JSON.stringify(metaMap, null, 2), "utf-8");

  const ytSuccess = Object.keys(metaMap).filter((k) => k.startsWith("yt:")).length;
  const blSuccess = Object.keys(metaMap).filter((k) => k.startsWith("bl:")).length;

  console.log(
    `\n✅ 已写入 YouTube ${ytSuccess}/${ytIdList.length} + Bilibili ${blSuccess}/${bvidList.length} 条元数据 → ${OUTPUT}`
  );
}

main().catch((e) => {
  console.error("预取脚本失败:", e);
  process.exit(1);
});
