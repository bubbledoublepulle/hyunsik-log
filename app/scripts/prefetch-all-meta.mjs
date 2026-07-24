/**
 * 构建时预取 YouTube + Bilibili 视频元数据（封面、发布时间、播放量、时长）。
 * Node.js 环境无 CORS 限制，可直连 Bilibili API 和 YouTube 页面。
 *
 * 用法: node scripts/prefetch-all-meta.mjs
 * 输出: src/data/video-meta.json
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

// ==================== YouTube 数据抓取（无 API Key，页面HTML解析） ====================

/**
 * 从 YouTube 页面 HTML 中提取 ytInitialPlayerResponse JSON。
 * 包含 publishDate, viewCount, lengthSeconds, title, thumbnails 等完整数据。
 */
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

    // 提取 ytInitialPlayerResponse JSON
    const match = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!match) {
      console.error(`  ❌ YouTube ${videoId}: 未找到 ytInitialPlayerResponse`);
      return null;
    }

    const playerData = JSON.parse(match[1]);

    const videoDetails = playerData.videoDetails || {};
    const microformat =
      playerData.microformat?.playerMicroformatRenderer || {};

    const title = videoDetails.title || "";
    const lengthSeconds = parseInt(videoDetails.lengthSeconds) || 0;
    const viewCount = parseInt(videoDetails.viewCount) || 0;
    const publishDate = microformat.publishDate || "";

    // 缩略图 URL
    const thumbnails = videoDetails.thumbnail?.thumbnails || [];
    const thumbnail =
      thumbnails.length > 0
        ? thumbnails[thumbnails.length - 1].url // 取最大尺寸
        : `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    const result = {
      title,
      thumbnail,
      duration: lengthSeconds > 0 ? formatDuration(lengthSeconds) : "",
      views: viewCount > 0 ? formatViews(viewCount) : "",
      publishedAt: publishDate
        ? publishDate.split("T")[0]
        : "", // YYYY-MM-DD
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

    // pubdate 是 Unix 时间戳（秒）
    const pubDate = d.pubdate
      ? new Date(d.pubdate * 1000).toISOString().split("T")[0]
      : "";

    const result = {
      title: d.title || "",
      thumbnail: d.pic || "",
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

  // 读取综艺数据源，提取所有链接
  const showDataPath = resolve(ROOT, "src/lib/showData.ts");
  const showDataSrc = readFileSync(showDataPath, "utf-8");

  // 提取 YouTube 视频 ID
  const ytMatches = showDataSrc.matchAll(
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})|youtu\.be\/([a-zA-Z0-9_-]{11})/g
  );
  const ytIds = [
    ...new Set(
      [...ytMatches].map((m) => m[1] || m[2]).filter(Boolean)
    ),
  ];
  console.log(`发现 ${ytIds.length} 个 YouTube 视频ID: ${ytIds.join(", ")}`);

  // 提取 Bilibili BV 号
  const bvMatches = showDataSrc.matchAll(
    /bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/g
  );
  const bvids = [...new Set([...bvMatches].map((m) => m[1]))];
  console.log(`发现 ${bvids.length} 个 Bilibili BV号: ${bvids.join(", ")}`);

  const metaMap = {};

  // ① 抓取 YouTube 数据
  console.log("\n--- YouTube ---");
  for (const videoId of ytIds) {
    const meta = await fetchYouTubeMeta(videoId);
    if (meta) {
      metaMap[`yt:${videoId}`] = meta;
    }
    // 请求间隔（避免被限速）
    await new Promise((r) => setTimeout(r, 800));
  }

  // ② 抓取 Bilibili 数据
  console.log("\n--- Bilibili ---");
  for (const bvid of bvids) {
    const meta = await fetchBilibiliMeta(bvid);
    if (meta) {
      metaMap[`bl:${bvid}`] = meta;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // 确保输出目录存在
  const outDir = dirname(OUTPUT);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  // 写入 JSON
  writeFileSync(OUTPUT, JSON.stringify(metaMap, null, 2), "utf-8");

  const ytSuccess = Object.keys(metaMap).filter((k) =>
    k.startsWith("yt:")
  ).length;
  const blSuccess = Object.keys(metaMap).filter((k) =>
    k.startsWith("bl:")
  ).length;

  console.log(
    `\n✅ 已写入 YouTube ${ytSuccess}/${ytIds.length} + Bilibili ${blSuccess}/${bvids.length} 条元数据 → ${OUTPUT}`
  );
}

main().catch((e) => {
  console.error("预取脚本失败:", e);
  process.exit(1);
});
