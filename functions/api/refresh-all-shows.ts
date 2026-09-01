// functions/api/refresh-all-shows.ts
// 批量刷新所有 YouTube 视频播放量（串行，避免限流）

export async function onRequestPost(context) {
  const { env } = context;
  
  // 串行间隔（毫秒）
  const DELAY_MS = 2000;
  let updated = 0, failed = 0, skipped = 0;

  try {
    // 从 Supabase 获取所有视频
    const shows = await getAllShowsFromSupabase(env);
    
    for (const show of shows) {
      // 串行处理：每条视频之间等待
      if (updated + failed + skipped > 0) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }

      try {
        const metadata = await scrapeShowMetadata(show, env);
        if (!metadata) {
          // 抓取失败，保留原值，跳过
          skipped++;
          continue;
        }

        const updateOk = await updateShowInSupabase(env, show.id, metadata);
        if (updateOk) {
          updated++;
        } else {
          failed++;
        }
      } catch (e) {
        failed++;
      }
    }

    return new Response(JSON.stringify({
      updated,
      failed,
      skipped,
      total: shows.length
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

// 从 Supabase 获取所有 shows
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

// 抓取视频元数据（只刷新 YouTube）
async function scrapeShowMetadata(show, env) {
  const links = show.links || [];
  const youtubeLink = links.find(l => /youtube\.com|youtu\.be/.test(l.url));

  if (!youtubeLink) {
    return null; // 没有 YouTube 链接，跳过
  }

  const videoId = extractYouTubeId(youtubeLink.url);
  if (!videoId) {
    return null;
  }

  // 方法1: YouTube Data API v3（优先）
  if (env.YOUTUBE_API_KEY) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${env.YOUTUBE_API_KEY}`;
      const resp = await fetch(apiUrl);
      if (resp.ok) {
        const data = await resp.json();
        const item = data.items?.[0];
        if (item?.statistics?.viewCount) {
          const viewCount = parseInt(item.statistics.viewCount, 10);
          return {
            views: formatViews(viewCount)
          };
        }
      }
    } catch (e) {
      console.log('Data API failed:', e.message);
    }
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

    if (resp.ok) {
      const data = await resp.json();
      const vd = data.videoDetails;
      if (vd?.viewCount) {
        return {
          views: formatViews(parseInt(vd.viewCount, 10))
        };
      }
    }
  } catch (e) {
    console.log('Internal API failed:', e.message);
  }

  // 所有方法都失败，返回 null（保留原值）
  return null;
}

// 更新 Supabase
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

// 提取 YouTube ID
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

// 格式化播放量
function formatViews(views) {
  if (views >= 100000000) return `${(views / 100000000).toFixed(1).replace(/\.0$/, "")}亿`;
  if (views >= 10000) return `${(views / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  return views.toLocaleString();
}
