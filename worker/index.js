/**
 * Cloudflare Worker
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(url, request, env);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller, env, ctx) {
    // Cron Trigger: 每 2 小时批量刷新所有视频元数据
    if (controller.cron === "0 */2 * * *") {
      console.log("[cron] Starting batch refresh at", new Date().toISOString());
      ctx.waitUntil(handleRefreshAllShows(env, ctx));
    }
  },
};

async function handleApi(url, request, env) {
  if (url.pathname === "/api/login") {
    return handleLogin(request, env);
  }
  if (url.pathname === "/api/verify") {
    return handleVerify(request, env);
  }
  if (url.pathname === "/api/youtube-meta") {
    return handleYouTubeMeta(url, env);
  }
  if (url.pathname === "/api/image-proxy") {
    return handleImageProxy(url);
  }
  if (url.pathname === "/api/refresh-show") {
    return jsonResponse(await handleRefreshShow(url, env), false);
  }
  if (url.pathname === "/api/refresh-all-shows") {
    return jsonResponse(await handleRefreshAllShows(env), false);
  }
  return Response.json({ error: "not found" }, { status: 404 });
}

async function handleLogin(request, env) {
  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }
  try {
    const { password } = await request.json();
    if (!password) {
      return Response.json({ error: "password required" }, { status: 400 });
    }
    const adminPassword = env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return Response.json({ error: "server config error" }, { status: 500 });
    }
    if (password !== adminPassword) {
      return Response.json({ error: "invalid password" }, { status: 401 });
    }
    const token = await generateToken(env);
    return Response.json(
      { success: true, token },
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
}

async function handleVerify(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return Response.json({ valid: false }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const isValid = await verifyToken(token, env);
  return Response.json(
    { valid: isValid },
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}

async function generateToken(env) {
  const timestamp = Math.floor(Date.now() / 1000);
  const data = `${timestamp}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(env.ADMIN_PASSWORD || "default-secret");
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  const tsBase64 = btoa(data);
  return `${tsBase64}:${sigBase64}`;
}

async function verifyToken(token, env) {
  try {
    const [tsBase64, sigBase64] = token.split(":");
    if (!tsBase64 || !sigBase64) return false;
    const timestamp = parseInt(atob(tsBase64), 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - timestamp > 7 * 24 * 60 * 60) {
      return false;
    }
    const data = `${timestamp}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(env.ADMIN_PASSWORD || "default-secret");
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const expectedSig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
    const expectedBase64 = btoa(String.fromCharCode(...new Uint8Array(expectedSig)));
    return sigBase64 === expectedBase64;
  } catch {
    return false;
  }
}

function jsonResponse(data, cacheable = true) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
  if (!cacheable) {
    headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
    headers["Pragma"] = "no-cache";
    headers["Expires"] = "0";
  } else {
    headers["Cache-Control"] = "public, max-age=86400";
  }
  return Response.json(data, { headers });
}

async function handleYouTubeMeta(url, env) {
  const videoId = url.searchParams.get("videoId");
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return Response.json({ error: "invalid videoId" }, { status: 400 });
  }

  // 优先使用 YouTube Data API v3
  if (env.YOUTUBE_API_KEY) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${env.YOUTUBE_API_KEY}`;
      const resp = await fetch(apiUrl);
      if (resp.ok) {
        const data = await resp.json();
        const item = data.items?.[0];
        if (item) {
          const snippet = item.snippet;
          const stats = item.statistics;
          const content = item.contentDetails;
          let lengthSeconds = 0;
          if (content?.duration) {
            const match = content.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (match) {
              const h = parseInt(match[1] || "0", 10);
              const m = parseInt(match[2] || "0", 10);
              const s = parseInt(match[3] || "0", 10);
              lengthSeconds = h * 3600 + m * 60 + s;
            }
          }
          return jsonResponse({
            title: snippet?.title || "",
            viewCount: parseInt(stats?.viewCount || "0", 10),
            lengthSeconds: lengthSeconds,
            publishedAt: snippet?.publishedAt || "",
            thumbnail: snippet?.thumbnails?.maxres?.url || snippet?.thumbnails?.high?.url || snippet?.thumbnails?.medium?.url || snippet?.thumbnails?.default?.url || "",
          });
        }
      }
    } catch (e) {
      console.log("[youtube-meta] Data API failed:", e.message);
    }
  }

  // 降级：YouTube 内部 API
  try {
    const result = await fetchYouTubeInternalAPI(videoId);
    if (result && result.viewCount > 0) {
      return jsonResponse(result);
    }
  } catch {}

  // 降级：页面爬取
  try {
    const result = await scrapeYouTubePage(videoId);
    if (result && result.viewCount > 0) {
      return jsonResponse(result);
    }
  } catch {}

  return Response.json(
    { error: "Failed to fetch video metadata" },
    { status: 502 }
  );
}

async function scrapeYouTubePage(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const resp = await fetch(watchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!resp.ok) {
    return null;
  }
  const html = await resp.text();
  let title = "", viewCount = 0, lengthSeconds = 0, publishedAt = "", thumbnail = "", author = "";
  const marker = "ytInitialPlayerResponse";
  const markerIdx = html.indexOf(marker);
  if (markerIdx >= 0) {
    const braceStart = html.indexOf("{", markerIdx + marker.length);
    if (braceStart >= 0) {
      let depth = 0, braceEnd = -1;
      for (let i = braceStart; i < html.length; i++) {
        if (html[i] === "{") depth++;
        if (html[i] === "}") {
          depth--;
          if (depth === 0) {
            braceEnd = i + 1;
            break;
          }
        }
      }
      if (braceEnd > braceStart) {
        try {
          const player = JSON.parse(html.slice(braceStart, braceEnd));
          const vd = player?.videoDetails;
          const mf = player?.microformat?.playerMicroformatRenderer;
          if (vd) {
            title = vd.title || "";
            viewCount = parseInt(vd.viewCount, 10) || 0;
            lengthSeconds = parseInt(vd.lengthSeconds, 10) || 0;
            author = vd.author || "";
            const thumbs = vd?.thumbnail?.thumbnails;
            if (thumbs && thumbs.length > 0) {
              thumbnail = thumbs[thumbs.length - 1].url;
            }
          }
          if (mf?.publishDate) {
            publishedAt = mf.publishDate.split("T")[0];
          }
        } catch {}
      }
    }
  }
  if (!title || !publishedAt || !thumbnail) {
    const ldRegex = /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let ldMatch;
    while ((ldMatch = ldRegex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(ldMatch[1]);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item["@type"] === "VideoObject") {
            if (!title) title = item.name || "";
            if (!thumbnail) {
              thumbnail = Array.isArray(item.thumbnailUrl) ? item.thumbnailUrl[0] : item.thumbnailUrl || "";
            }
            if (!publishedAt && item.uploadDate) {
              publishedAt = item.uploadDate.split("T")[0];
            }
            if (!lengthSeconds && item.duration) {
              lengthSeconds = parseISODuration(item.duration);
            }
          }
        }
      } catch { continue; }
    }
  }
  if (!thumbnail) {
    thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }
  if (!title) return null;
  return { title, viewCount, publishedAt, lengthSeconds, thumbnail, author };
}

function parseISODuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  return h * 3600 + m * 60 + s;
}

async function fetchYouTubeInternalAPI(videoId) {
  const resp = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoId,
      context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00" } },
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const vd = data?.videoDetails;
  const mf = data?.microformat?.playerMicroformatRenderer;
  let thumbnail = "";
  const thumbnails = vd?.thumbnail?.thumbnails;
  if (thumbnails && thumbnails.length > 0) {
    thumbnail = thumbnails[thumbnails.length - 1].url;
  }
  if (!thumbnail) {
    thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }
  return {
    title: vd?.title || "",
    viewCount: parseInt(vd?.viewCount, 10) || 0,
    publishedAt: mf?.publishDate ? mf.publishDate.split("T")[0] : "",
    lengthSeconds: parseInt(vd?.lengthSeconds, 10) || 0,
    thumbnail,
    author: vd?.author || "",
  };
}

async function handleImageProxy(url) {
  const imageUrl = url.searchParams.get("url");
  if (!imageUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }
  try {
    const decodedUrl = decodeURIComponent(imageUrl);
    const imageResp = await fetch(decodedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": new URL(decodedUrl).origin,
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
      },
    });
    if (!imageResp.ok) {
      return new Response("Failed to fetch image", { status: 502 });
    }
    const headers = new Headers(imageResp.headers);
    headers.set("Cache-Control", "public, max-age=86400");
    headers.set("Access-Control-Allow-Origin", "*");
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "image/jpeg");
    }
    return new Response(imageResp.body, {
      status: imageResp.status,
      statusText: imageResp.statusText,
      headers,
    });
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
}


// ==================== 视频元数据批量刷新 ====================

async function handleRefreshShow(url, env) {
  const showId = url.searchParams.get("showId");
  const videoId = url.searchParams.get("videoId");
  const bvid = url.searchParams.get("bvid");

  console.log("[handleRefreshShow] showId:", showId, "videoId:", videoId, "bvid:", bvid);

  if (!showId) {
    return Response.json({ error: "showId required" }, { status: 400 });
  }

  try {
    console.log("[handleRefreshShow] fetching show from Supabase...");
    const show = await getShowFromSupabase(env, showId);
    console.log("[handleRefreshShow] show found:", show ? "yes" : "no");
    if (!show) {
      return Response.json({ error: "show not found" }, { status: 404 });
    }

    console.log("[handleRefreshShow] scraping metadata...");
    const metadata = await scrapeShowMetadata(show, videoId, bvid, env);
    console.log("[handleRefreshShow] metadata:", metadata ? JSON.stringify(metadata) : "null");
    if (!metadata) {
      // 抓取失败，保留原值，返回成功但不更新
      return jsonResponse({ success: true, updated: false, reason: "fetch failed, preserving original value" }, false);
    }

    console.log("[handleRefreshShow] updating Supabase...");
    await updateShowInSupabase(env, showId, metadata);

    return jsonResponse({ success: true, updated: true, metadata }, false);
  } catch (e) {
    console.error("[refresh-show] error:", e);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}

async function handleRefreshAllShows(env, ctx) {
  try {
    const shows = await getAllShowsFromSupabase(env);
    
    const DELAY_MS = 2000; // 串行间隔 2 秒
    let updated = 0, failed = 0, skipped = 0;
    
    for (const show of shows) {
      try {
        // 串行处理：等待间隔
        if (updated + failed + skipped > 0) {
          await new Promise(r => setTimeout(r, DELAY_MS));
        }

        const metadata = await scrapeShowMetadata(show, null, null, env);
        if (!metadata) {
          // 抓取失败，保留原值，不计入失败
          console.log(`[refresh] Skipped ${show.id}: fetch failed, preserving original value`);
          skipped++;
          continue;
        }

        const updateOk = await updateShowInSupabase(env, show.id, metadata);
        if (updateOk) {
          console.log(`[refresh] Updated ${show.id}: views=${metadata.views}`);
          updated++;
        } else {
          console.log(`[refresh] Failed to update ${show.id} in Supabase`);
          failed++;
        }
      } catch (e) {
        console.error(`[refresh] Error for ${show.id}:`, e);
        failed++;
      }
    }

    console.log(`[refresh] Complete: ${updated} updated, ${failed} failed, ${skipped} skipped, total: ${shows.length}`);
    return { updated, failed, skipped, total: shows.length };
  } catch (e) {
    console.error("[refresh-all] error:", e);
    return { updated: 0, failed: 0, skipped: 0, total: 0 };
  }
}

async function getShowFromSupabase(env, showId) {
  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/shows?id=eq.${showId}&select=*`, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data[0] || null;
}

async function getAllShowsFromSupabase(env) {
  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/shows?select=*`, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!resp.ok) return [];
  return await resp.json();
}

async function scrapeShowMetadata(show, videoIdParam, bvidParam, env) {
  // 只刷新有 YouTube 链接的视频，不碰 Bilibili
  const links = show.links || [];
  const youtubeLink = links.find(l => /youtube\.com|youtu\.be/.test(l.url));

  if (youtubeLink || videoIdParam) {
    const videoId = videoIdParam || extractYouTubeIdWorker(youtubeLink?.url || "");
    if (videoId) {
      // 优先使用 YouTube Data API v3
      if (env.YOUTUBE_API_KEY) {
        try {
          const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${env.YOUTUBE_API_KEY}`;
          const resp = await fetch(apiUrl);
          if (resp.ok) {
            const data = await resp.json();
            const item = data.items?.[0];
            if (item?.statistics?.viewCount) {
              const viewCount = parseInt(item.statistics.viewCount, 10);
              console.log(`[scrape] Data API success for ${videoId}: ${viewCount} views`);
              return {
                views: formatViewsWorker(viewCount),
              };
            }
          }
          console.log(`[scrape] Data API no data for ${videoId}, trying fallback...`);
        } catch (e) {
          console.log(`[scrape] Data API failed for ${videoId}:`, e.message);
        }
      }

      // 降级：YouTube 内部 API
      try {
        const result = await fetchYouTubeInternalAPI(videoId);
        if (result && result.viewCount > 0) {
          console.log(`[scrape] Internal API success for ${videoId}: ${result.viewCount} views`);
          return {
            views: formatViewsWorker(result.viewCount),
          };
        }
      } catch (e) {
        console.log(`[scrape] Internal API failed for ${videoId}:`, e.message);
      }

      // 降级：页面爬取
      try {
        const result = await scrapeYouTubePage(videoId);
        if (result && result.viewCount > 0) {
          console.log(`[scrape] Page scrape success for ${videoId}: ${result.viewCount} views`);
          return {
            views: formatViewsWorker(result.viewCount),
          };
        }
      } catch (e) {
        console.log(`[scrape] Page scrape failed for ${videoId}:`, e.message);
      }

      console.log(`[scrape] All methods failed for ${videoId}, returning null (preserving original)`);
    }
  }

  // 跳过 Bilibili，返回 null（保留原值）
  return null;
}

async function updateShowInSupabase(env, showId, metadata) {
  // 只更新播放量，不更新其他字段
  if (!metadata.views) return false;

  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/shows?id=eq.${showId}`, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ views: metadata.views }),
  });
  return resp.ok;
}

function extractYouTubeIdWorker(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function extractBilibiliIdWorker(url) {
  if (!url) return null;
  const fullMatch = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/);
  if (fullMatch) return fullMatch[1];
  const b23Match = url.match(/b23\.tv\/(BV[a-zA-Z0-9]+)/i);
  if (b23Match) return b23Match[1];
  return null;
}

function formatViewsWorker(views) {
  if (views >= 100000000) return `${(views / 100000000).toFixed(1).replace(/\.0$/, "")}亿`;
  if (views >= 10000) return `${(views / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  return views.toLocaleString();
}

function formatDurationWorker(seconds) {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
