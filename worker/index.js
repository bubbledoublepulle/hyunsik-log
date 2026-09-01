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
  async scheduled(event, env, ctx) {
    // Cron Trigger: 每 2 小时批量刷新所有视频元数据
    if (event.cron === "0 */2 * * *") {
      console.log("[cron] Starting batch refresh at", new Date().toISOString());
      await handleRefreshAllShows(env);
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
    return handleYouTubeMeta(url);
  }
  if (url.pathname === "/api/image-proxy") {
    return handleImageProxy(url);
  }
  if (url.pathname === "/api/refresh-show") {
    return handleRefreshShow(url, env);
  }
  if (url.pathname === "/api/refresh-all-shows") {
    return handleRefreshAllShows(env);
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

function jsonResponse(data) {
  return Response.json(data, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function handleYouTubeMeta(url) {
  const videoId = url.searchParams.get("videoId");
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return Response.json({ error: "invalid videoId" }, { status: 400 });
  }
  try {
    const result = await scrapeYouTubePage(videoId);
    if (result) {
      return jsonResponse(result);
    }
  } catch {}
  try {
    const result = await fetchYouTubeInternalAPI(videoId);
    if (result) {
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

  if (!showId) {
    return Response.json({ error: "showId required" }, { status: 400 });
  }

  try {
    // 从 Supabase 获取该视频
    const show = await getShowFromSupabase(env, showId);
    if (!show) {
      return Response.json({ error: "show not found" }, { status: 404 });
    }

    // 抓取元数据
    const metadata = await scrapeShowMetadata(show, videoId, bvid);
    if (!metadata) {
      return Response.json({ error: "failed to fetch metadata" }, { status: 502 });
    }

    // 更新 Supabase
    await updateShowInSupabase(env, showId, metadata);

    return jsonResponse({ success: true, metadata });
  } catch (e) {
    console.error("[refresh-show] error:", e);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}

async function handleRefreshAllShows(env) {
  try {
    // 从 Supabase 获取所有视频
    const shows = await getAllShowsFromSupabase(env);

    let updated = 0, failed = 0;
    for (const show of shows) {
      try {
        const metadata = await scrapeShowMetadata(show);
        if (metadata) {
          await updateShowInSupabase(env, show.id, metadata);
          updated++;
        } else {
          failed++;
        }
      } catch (e) {
        console.error(`[refresh] Failed for ${show.id}:`, e);
        failed++;
      }
    }

    console.log(`[cron] Batch refresh complete: ${updated} updated, ${failed} failed`);
    return { updated, failed };
  } catch (e) {
    console.error("[refresh-all] error:", e);
    return { updated: 0, failed: 0 };
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

async function scrapeShowMetadata(show, videoIdParam, bvidParam) {
  // 从 links 中找到 YouTube/Bilibili 链接
  const links = show.links || [];
  const youtubeLink = links.find(l => /youtube\.com|youtu\.be/.test(l.url));
  const bilibiliLink = links.find(l => /bilibili\.com|b23\.tv/.test(l.url));

  let result = null;

  if (youtubeLink || videoIdParam) {
    const videoId = videoIdParam || extractYouTubeIdWorker(youtubeLink?.url || "");
    if (videoId) {
      result = await scrapeYouTubePage(videoId) || await fetchYouTubeInternalAPI(videoId);
      if (result) {
        return {
          views: formatViewsWorker(result.viewCount),
        };
      }
    }
  }

  if (bilibiliLink || bvidParam) {
    const bvid = bvidParam || extractBilibiliIdWorker(bilibiliLink?.url || "");
    if (bvid) {
      // Bilibili 抓取逻辑（简化版）
      const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
      try {
        const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
        if (resp.ok) {
          const data = await resp.json();
          if (data?.code === 0 && data?.data) {
            const d = data.data;
            const durationSec = d.duration || 0;
            const viewCount = d.stat?.view || 0;
            const publishedAt = d.pubdate ? new Date(d.pubdate * 1000).toISOString().split("T")[0] : "";
            return {
              views: formatViewsWorker(viewCount),
            };
          }
        }
      } catch {
        // Bilibili 抓取失败
      }
    }
  }

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
