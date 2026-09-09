import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

/**
 * 开发环境 YouTube 元数据代理插件
 *
 * 模拟生产环境 Cloudflare Worker 的 /api/youtube-meta 端点。
 * 两级策略：页面 HTML 爬取（ytInitialPlayerResponse + JSON-LD）→ 内部 API 降级
 */

/** 解析 ISO 8601 duration (PT1H15M30S) → 秒数 */
function parseISODuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  const h = parseInt(match[1] || "0", 10)
  const m = parseInt(match[2] || "0", 10)
  const s = parseInt(match[3] || "0", 10)
  return h * 3600 + m * 60 + s
}

/** 第 1 级：爬取 YouTube watch 页面 HTML，提取 ytInitialPlayerResponse + JSON-LD */
async function scrapeYouTubePage(videoId: string): Promise<any | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`

  const resp = await fetch(watchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  })
  if (!resp.ok) return null

  const html = await resp.text()

  let title = ""
  let viewCount = 0
  let lengthSeconds = 0
  let publishedAt = ""
  let thumbnail = ""
  let author = ""

  // 主数据源：ytInitialPlayerResponse
  const marker = "ytInitialPlayerResponse"
  const markerIdx = html.indexOf(marker)
  if (markerIdx >= 0) {
    const braceStart = html.indexOf("{", markerIdx + marker.length)
    if (braceStart >= 0) {
      let depth = 0
      let braceEnd = -1
      for (let i = braceStart; i < html.length; i++) {
        if (html[i] === "{") depth++
        if (html[i] === "}") {
          depth--
          if (depth === 0) {
            braceEnd = i + 1
            break
          }
        }
      }
      if (braceEnd > braceStart) {
        try {
          const player: any = JSON.parse(html.slice(braceStart, braceEnd))
          const vd = player?.videoDetails
          const mf = player?.microformat?.playerMicroformatRenderer

          if (vd) {
            title = vd.title || ""
            viewCount = parseInt(vd.viewCount, 10) || 0
            lengthSeconds = parseInt(vd.lengthSeconds, 10) || 0
            author = vd.author || ""

            const thumbs = vd?.thumbnail?.thumbnails
            if (thumbs && thumbs.length > 0) {
              thumbnail = thumbs[thumbs.length - 1].url
            }
          }
          if (mf?.publishDate) {
            publishedAt = mf.publishDate.split("T")[0]
          }
        } catch {
          // JSON 解析失败，降级到 JSON-LD
        }
      }
    }
  }

  // 补充数据源：JSON-LD VideoObject
  if (!title || !publishedAt || !thumbnail) {
    const ldRegex =
      /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
    let ldMatch: RegExpExecArray | null
    while ((ldMatch = ldRegex.exec(html)) !== null) {
      try {
        const parsed: any = JSON.parse(ldMatch[1])
        const items = Array.isArray(parsed) ? parsed : [parsed]
        for (const item of items) {
          if (item["@type"] === "VideoObject") {
            if (!title) title = item.name || ""
            if (!thumbnail) {
              thumbnail = Array.isArray(item.thumbnailUrl)
                ? item.thumbnailUrl[0]
                : item.thumbnailUrl || ""
            }
            if (!publishedAt && item.uploadDate) {
              publishedAt = item.uploadDate.split("T")[0]
            }
            if (!lengthSeconds && item.duration) {
              lengthSeconds = parseISODuration(item.duration)
            }
          }
        }
      } catch {
        continue
      }
    }
  }

  if (!thumbnail) {
    thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  }
  if (!title) return null

  return { title, viewCount, publishedAt, lengthSeconds, thumbnail, author }
}

/** 第 2 级：YouTube 内部 API 降级 */
async function fetchYouTubeInternalAPI(videoId: string): Promise<any | null> {
  const resp = await fetch(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20240101.00.00",
          },
        },
      }),
    }
  )
  if (!resp.ok) return null

  const data: any = await resp.json()
  const vd = data?.videoDetails
  const mf = data?.microformat?.playerMicroformatRenderer

  let thumbnail = ""
  const thumbnails = vd?.thumbnail?.thumbnails
  if (thumbnails && thumbnails.length > 0) {
    thumbnail = thumbnails[thumbnails.length - 1].url
  }
  if (!thumbnail) {
    thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  }

  return {
    title: vd?.title || "",
    viewCount: parseInt(vd?.viewCount, 10) || 0,
    publishedAt: mf?.publishDate ? mf.publishDate.split("T")[0] : "",
    lengthSeconds: parseInt(vd?.lengthSeconds, 10) || 0,
    thumbnail,
    author: vd?.author || "",
  }
}

function youtubeMetaDevPlugin(): Plugin {
  return {
    name: "youtube-meta-dev-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/youtube-meta")) {
          return next()
        }

        const url = new URL(req.url, "http://localhost:5173")
        const videoId = url.searchParams.get("videoId")

        if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
          res.writeHead(400, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: "invalid videoId" }))
          return
        }

        try {
          // 第 1 级：页面爬取
          let result = await scrapeYouTubePage(videoId)

          // 第 2 级：内部 API 降级
          if (!result) {
            result = await fetchYouTubeInternalAPI(videoId)
          }

          if (result) {
            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify(result))
          } else {
            res.writeHead(502, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ error: "Failed to fetch video metadata" }))
          }
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: (e as Error).message || "fetch failed" }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), youtubeMetaDevPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/api/bilibili': {
        target: 'https://api.bilibili.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bilibili/, ''),
        headers: {
          Referer: 'https://www.bilibili.com/',
        },
      },
      '/api/youtube': {
        target: 'https://www.youtube.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/youtube/, ''),
      },
    },
  },
})
