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
