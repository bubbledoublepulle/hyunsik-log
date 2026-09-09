/**
 * 全自动更新 YouTube 视频播放量（GitHub Actions 定时任务）。
 *
 * 功能：
 * - 从 Supabase 读取所有 shows 数据
 * - 提取 YouTube 视频 ID（不处理 Bilibili）
 * - 批量调用 YouTube Data API v3（每批 50 个）
 * - 更新 Supabase 数据库中的 views / duration / date 字段
 * - 同时更新 src/data/video-meta.json
 * - 返回空数据或 API 失败时，保留原有数据不做修改
 *
 * 环境变量：
 *   VITE_YOUTUBE_API_KEY  - YouTube Data API v3 密钥（必须）
 *   SUPABASE_URL          - 从 src/lib/supabase.ts 自动读取，也可环境变量覆盖
 *   SUPABASE_ANON_KEY     - 从 src/lib/supabase.ts 自动读取，也可环境变量覆盖
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const YT_API_KEY = process.env.VITE_YOUTUBE_API_KEY;

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

function parseISODuration(iso) {
  if (!iso || typeof iso !== "string") return 0;
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  return h * 3600 + m * 60 + s;
}

function extractYouTubeId(url) {
  if (!url) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) return url.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ==================== 加载 Supabase 配置 ====================

function loadSupabaseConfig() {
  const envUrl = process.env.SUPABASE_URL;
  const envKey = process.env.SUPABASE_ANON_KEY;
  if (envUrl && envKey) {
    return { url: envUrl, key: envKey };
  }

  const supabasePath = resolve(ROOT, "src/lib/supabase.ts");
  if (!existsSync(supabasePath)) {
    return { url: envUrl, key: envKey };
  }

  const content = readFileSync(supabasePath, "utf-8");
  const urlMatch = content.match(
    /const\s+supabaseUrl\s*=\s*["']([^"']+)["']/
  );
  const keyMatch = content.match(
    /const\s+supabaseAnonKey\s*=\s*["']([^"']+)["']/ 
  );

  return {
    url: urlMatch?.[1] || envUrl,
    key: keyMatch?.[1] || envKey,
  };
}

// ==================== Supabase REST API 操作 ====================

async function fetchAllShows(supabaseUrl, supabaseKey) {
  const resp = await fetch(`${supabaseUrl}/rest/v1/shows?select=*`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });
  if (!resp.ok) {
    throw new Error(`Supabase 读取失败: HTTP ${resp.status}`);
  }
  return await resp.json();
}

async function updateShow(supabaseUrl, supabaseKey, showId, updates) {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/shows?id=eq.${encodeURIComponent(showId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(updates),
    }
  );
  return resp.ok;
}

// ==================== YouTube Data API v3 ====================

async function fetchYouTubeBatch(videoIds) {
  const ids = videoIds.join(",");
  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=statistics,snippet,contentDetails` +
    `&id=${ids}&key=${YT_API_KEY}`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!resp.ok) {
    throw new Error(`YouTube API 失败: HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const result = new Map();

  for (const item of data.items || []) {
    const id = item.id;
    const snippet = item.snippet || {};
    const stats = item.statistics || {};
    const content = item.contentDetails || {};

    result.set(id, {
      title: snippet.title || "",
      viewCount: parseInt(stats.viewCount || "0", 10),
      publishedAt: snippet.publishedAt || "",
      duration: content.duration || "",
      thumbnail:
        snippet.thumbnails?.maxres?.url ||
        snippet.thumbnails?.high?.url ||
        snippet.thumbnails?.medium?.url ||
        `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
    });
  }

  return result;
}

// ==================== 并发控制 ====================

async function runWithConcurrency(tasks, concurrency = 5) {
  const results = [];
  const executing = [];

  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);

    if (tasks.length >= concurrency) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(results);
}

// ==================== 主流程 ====================

async function main() {
  const startTime = Date.now();
  console.log("=== YouTube 播放量全自动更新 ===\n");

  if (!YT_API_KEY) {
    console.error("❌ 错误：未设置 VITE_YOUTUBE_API_KEY 环境变量");
    process.exit(1);
  }

  const { url: supabaseUrl, key: supabaseKey } = loadSupabaseConfig();
  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ 错误：无法读取 Supabase 配置");
    console.error("   请确保 src/lib/supabase.ts 存在且包含 supabaseUrl 和 supabaseAnonKey");
    console.error("   或在 GitHub Secrets 中设置 SUPABASE_URL 和 SUPABASE_ANON_KEY");
    process.exit(1);
  }

  console.log(`Supabase: ${supabaseUrl}`);
  console.log(`YouTube API Key: ${YT_API_KEY.slice(0, 8)}...${YT_API_KEY.slice(-4)}\n`);

  // ① 读取 Supabase 数据
  console.log("📥 从 Supabase 读取 shows 数据...");
  const shows = await fetchAllShows(supabaseUrl, supabaseKey);
  console.log(`   共 ${shows.length} 条记录\n`);

  // ② 提取所有 YouTube 视频 ID
  const ytMap = new Map(); // videoId -> [{ showId, linkIndex }]
  for (const show of shows) {
    const links = show.links || [];
    for (let i = 0; i < links.length; i++) {
      const videoId = extractYouTubeId(links[i].url);
      if (videoId) {
        if (!ytMap.has(videoId)) ytMap.set(videoId, []);
        ytMap.get(videoId).push({ showId: show.id, linkIndex: i });
      }
    }
  }

  const uniqueIds = [...ytMap.keys()];
  console.log(`🎬 发现 ${uniqueIds.length} 个唯一 YouTube 视频\n`);

  if (uniqueIds.length === 0) {
    console.log("ℹ️ 没有 YouTube 视频需要更新，退出");
    return;
  }

  // ③ 批量查询 YouTube API（每批 50 个）
  console.log("🌐 开始查询 YouTube Data API...");
  const allData = new Map();
  const totalBatches = Math.ceil(uniqueIds.length / 50);

  for (let i = 0; i < uniqueIds.length; i += 50) {
    const batch = uniqueIds.slice(i, i + 50);
    const batchNum = Math.floor(i / 50) + 1;
    console.log(`   批次 ${batchNum}/${totalBatches}: ${batch.length} 个视频`);

    try {
      const data = await fetchYouTubeBatch(batch);
      for (const [k, v] of data) allData.set(k, v);
      console.log(`   ✓ 成功获取 ${data.size} 条数据`);
    } catch (e) {
      console.error(`   ✗ 批次 ${batchNum} 失败: ${e.message}`);
    }

    if (i + 50 < uniqueIds.length) await sleep(1000);
  }

  console.log(`\n📊 YouTube API 共返回 ${allData.size} 条有效数据\n`);

  // ④ 更新 Supabase（并发控制，空数据不覆盖）
  console.log("💾 开始更新 Supabase...");
  let updatedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let unchangedCount = 0;

  const updateTasks = shows.map((show) => async () => {
    const links = show.links || [];
    let newViews = null;
    let newDuration = null;
    let newDate = null;
    let hasValidData = false;

    for (const link of links) {
      const videoId = extractYouTubeId(link.url);
      if (!videoId || !allData.has(videoId)) continue;

      const data = allData.get(videoId);

      // 空数据不覆盖：标题为空视为无效
      if (!data.title) {
        skippedCount++;
        continue;
      }

      if (data.viewCount > 0) {
        newViews = formatViews(data.viewCount);
        hasValidData = true;
      }
      if (data.duration) {
        const sec = parseISODuration(data.duration);
        if (sec > 0) {
          newDuration = formatDuration(sec);
          hasValidData = true;
        }
      }
      if (data.publishedAt) {
        newDate = data.publishedAt.split("T")[0];
        hasValidData = true;
      }
    }

    if (!hasValidData) {
      unchangedCount++;
      return;
    }

    // 检查是否真的需要更新（避免无意义的写入）
    const updates = {};
    if (newViews && newViews !== show.views) updates.views = newViews;
    if (newDuration && newDuration !== show.duration) updates.duration = newDuration;
    if (newDate && newDate !== show.date) updates.date = newDate;

    if (Object.keys(updates).length === 0) {
      unchangedCount++;
      return;
    }

    const ok = await updateShow(supabaseUrl, supabaseKey, show.id, updates);
    if (ok) {
      updatedCount++;
      const changes = Object.entries(updates)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      console.log(`   ✓ ${show.id}: ${changes}`);
    } else {
      failedCount++;
      console.log(`   ✗ ${show.id}: 更新失败`);
    }
  });

  await runWithConcurrency(updateTasks, 5);

  // ⑤ 更新 video-meta.json（只写入有有效数据的）
  console.log("\n📝 更新 video-meta.json...");
  const metaMap = {};
  for (const [videoId, data] of allData) {
    if (!data.title) continue; // 空数据不写入
    const sec = parseISODuration(data.duration);
    metaMap[`yt:${videoId}`] = {
      title: data.title,
      thumbnail: data.thumbnail,
      duration: sec > 0 ? formatDuration(sec) : "",
      views: data.viewCount > 0 ? formatViews(data.viewCount) : "",
      publishedAt: data.publishedAt ? data.publishedAt.split("T")[0] : "",
      source: "YouTube",
      fetchedAt: Date.now(),
    };
  }

  const metaPath = resolve(ROOT, "src/data/video-meta.json");
  mkdirSync(dirname(metaPath), { recursive: true });
  writeFileSync(metaPath, JSON.stringify(metaMap, null, 2), "utf-8");
  console.log(`   ✓ 写入 ${Object.keys(metaMap).length} 条元数据\n`);

  // ⑥ 统计报告
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("========================================");
  console.log(`✅ 完成！总耗时 ${elapsed} 秒`);
  console.log(`   Supabase 更新: ${updatedCount} 条`);
  console.log(`   失败: ${failedCount} 条`);
  console.log(`   跳过(空数据): ${skippedCount} 条`);
  console.log(`   无变化: ${unchangedCount} 条`);
  console.log(`   video-meta.json: ${Object.keys(metaMap).length} 条`);
  console.log("========================================");

  // 如果有更新，返回退出码 0 让 GitHub Actions 继续提交
  // 如果没有更新，也返回 0（check_changes 会判断 git diff）
}

main().catch((e) => {
  console.error("\n❌ 脚本执行失败:", e.message);
  process.exit(1);
});
