/**
 * 构建时预取 Bilibili 视频元数据（封面、时长、播放量）。
 * Node.js 环境无 CORS 限制，可直接调用 Bilibili API。
 *
 * 用法: node scripts/prefetch-bilibili-meta.mjs
 * 输出: src/data/bilibili-meta.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUTPUT = resolve(ROOT, "src/data/bilibili-meta.json");

// 读取综艺数据源，提取所有 Bilibili 链接的 BV 号
const showDataPath = resolve(ROOT, "src/lib/showData.ts");
const showDataSrc = readFileSync(showDataPath, "utf-8");

// 从源代码中提取所有 Bilibili BV 号
const bvMatches = showDataSrc.matchAll(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/g);
const bvids = [...new Set([...bvMatches].map((m) => m[1]))];
console.log(`发现 ${bvids.length} 个唯一 Bilibili BV 号: ${bvids.join(", ")}`);

/**
 * 将秒数转为人类可读格式
 */
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}小时${m}分`;
  if (m > 0) return `${m}分${s > 0 ? s + "秒" : ""}`;
  return `${s}秒`;
}

/**
 * 将播放量数字转为人类可读格式
 */
function formatViews(views) {
  if (views >= 100000000) {
    return `${(views / 100000000).toFixed(1).replace(/\.0$/, "")}亿`;
  }
  if (views >= 10000) {
    return `${(views / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  }
  return views.toLocaleString();
}

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
      console.error(`  ❌ ${bvid}: HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (data?.code !== 0 || !data?.data) {
      console.error(`  ❌ ${bvid}: API code=${data?.code}, message=${data?.message}`);
      return null;
    }
    const d = data.data;
    const result = {
      thumbnail: d.pic || "",
      duration: d.duration ? formatDuration(d.duration) : "",
      views: d.stat?.view != null ? formatViews(d.stat.view) : "",
      title: d.title || "",
      fetchedAt: Date.now(),
    };
    console.log(`  ✅ ${bvid}: "${d.title}" — 封面=${result.thumbnail}, 时长=${result.duration}, 播放=${result.views}`);
    return result;
  } catch (e) {
    console.error(`  ❌ ${bvid}: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log("=== Bilibili 元数据预取 (构建时) ===\n");

  const metaMap = {};
  for (const bvid of bvids) {
    const meta = await fetchBilibiliMeta(bvid);
    if (meta) {
      metaMap[bvid] = meta;
    }
  }

  // 确保输出目录存在
  const outDir = dirname(OUTPUT);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  // 写入 JSON（紧凑格式，减少包体积）
  writeFileSync(OUTPUT, JSON.stringify(metaMap, null, 2), "utf-8");

  console.log(`\n✅ 已写入 ${Object.keys(metaMap).length}/${bvids.length} 条 Bilibili 元数据 → ${OUTPUT}`);
}

main().catch((e) => {
  console.error("预取脚本失败:", e);
  process.exit(1);
});
