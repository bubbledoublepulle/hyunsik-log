// functions/api/refresh-all-shows.ts
// 批量刷新所有 YouTube 视频播放量（串行，避免限流）

export async function onRequestPost(context) {
  const { env } = context;
  
  const DELAY_MS = 2000;
  let updated = 0, failed = 0, skipped = 0;
  const errors = []; // 记录详细错误

  try {
    const shows = await getAllShowsFromSupabase(env);
    
    for (const show of shows) {
      if (updated + failed + skipped > 0) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }

      try {
        // 检查是否有 YouTube 链接
        const links = show.links || [];
        const youtubeLink = links.find(l => /youtube\.com|youtu\.be/.test(l.url));
        
        if (!youtubeLink) {
          skipped++;
          errors.push({ id: show.id, title: show.title, reason: "no YouTube link" });
          continue;
        }

        const videoId = extractYouTubeId(youtubeLink.url);
        if (!videoId) {
          skipped++;
          errors.push({ id: show.id, title: show.title, reason: "invalid YouTube URL", url: youtubeLink.url });
          continue;
        }

        const metadata = await scrapeShowMetadata(show, env, errors);
        if (!metadata) {
          skipped++;
          // 错误已在 scrapeShowMetadata 中记录
          continue;
        }

        const updateOk = await updateShowInSupabase(env, show.id, metadata);
        if (updateOk) {
          updated++;
        } else {
          failed++;
          errors.push({ id: show.id, title: show.title, reason: "Supabase update failed" });
        }
      } catch (e) {
        failed++;
        errors.push({ id: show.id, title: show.title, reason: "exception", message: e.message });
      }
    }

    return new Response(JSON.stringify({
      updated,
      failed,
      skipped,
      total: shows.length,
      errors: errors.slice(0, 10) // 只返回前10条错误，避免响应太大
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Internal error',
      message: e.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
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

async function scrapeShowMetadata(show, env, errors) {
  const links = show.links || [];
  const youtubeLink = links.find(l => /youtube\.com|youtu\.be/.test(l.url));
  if (!youtubeLink) return null;

  const videoId = extractYouTubeId(youtubeLink.url);
  if (!videoId) return null;

  // 方法1: YouTube Data API v3（优先）
  if (env.YOUTUBE_API_KEY) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${env.YOUTUBE_API_KEY}`;
      const resp = await fetch(apiUrl);
      
      if (!resp.ok) {
        const errorText = await resp.text();
        errors.push({ 
          id: show.id, 
          title: show.title, 
          videoId,
          reason: "YouTube Data API HTTP error", 
          status: resp.status,
          response: errorText.substring(0, 200)
        });
      } else {
        const data = await resp.json();
        const item = data.items?.[0];
        
        if (!item) {
          errors.push({ 
            id: show.id, 
            title: show.title, 
            videoId,
            reason: "YouTube Data API: video not found (may be private/deleted)"
          });
        } else if (!item.statistics?.viewCount) {
          errors.push({ 
            id: show.id, 
            title: show.title, 
            videoId,
            reason: "YouTube Data API: no viewCount in response"
          });
        } else {
          const viewCount = parseInt(item.statistics.viewCount, 10);
          return { views: formatViews(viewCount) };
        }
      }
    } catch (e) {
      errors.push({ 
        id: show.id, 
        title: show.title, 
        videoId,
        reason: "YouTube Data API exception", 
        message: e.message 
      });
    }
  } else {
    errors.push({ 
      id: show.id, 
      title: show.title, 
      videoId,
      reason: "YOUTUBE_API_KEY not set, skipping Data API" 
    });
  }

  // 方法2: YouTube 内部 API（降级）
  try {
    const resp = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240701.00.00',
            hl: 'en',
            gl: 'US',
          }
        }
      })
    });

    if (!resp.ok) {
      errors.push({ 
        id: show.id, 
        title: show.title, 
        videoId,
        reason: "YouTube Internal API HTTP error", 
        status: resp.status 
      });
    } else {
      const data = await resp.json();
      const vd = data.videoDetails;
      
      if (!vd) {
        errors.push({ 
          id: show.id, 
          title: show.title, 
          videoId,
          reason: "YouTube Internal API: no videoDetails" 
        });
      } else if (!vd.viewCount) {
        errors.push({ 
          id: show.id, 
          title: show.title, 
          videoId,
          reason: "YouTube Internal API: no viewCount" 
        });
      } else {
        return { views: formatViews(parseInt(vd.viewCount, 10)) };
      }
    }
  } catch (e) {
    errors.push({ 
      id: show.id, 
      title: show.title, 
      videoId,
      reason: "YouTube Internal API exception", 
      message: e.message 
    });
  }

  // 所有方法都失败
  errors.push({ 
    id: show.id, 
    title: show.title, 
    videoId,
    reason: "All methods failed, preserving original value" 
  });
  return null;
}

async function updateShowInSupabase(env, showId, metadata) {
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

function extractYouTubeId(url) {
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

function formatViews(views) {
  if (views >= 100000000) return `${(views / 100000000).toFixed(1).replace(/\.0$/, "")}亿`;
  if (views >= 10000) return `${(views / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  return views.toLocaleString();
}
