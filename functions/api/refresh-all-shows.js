export async function onRequestPost(context) {
  const { env } = context;
  
  // 立即返回，异步处理（避免超时）
  const result = await processAsync(env);
  
  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    }
  });
}

async function processAsync(env) {
  try {
    // 快速检查环境变量
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return { error: 'Missing env vars', hasUrl: !!env.SUPABASE_URL, hasKey: !!env.SUPABASE_SERVICE_KEY };
    }

    // 快速查询 Supabase（只取3条测试）
    const resp = await fetch(env.SUPABASE_URL + "/rest/v1/shows?select=*&limit=3", {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
      },
    });
    
    if (!resp.ok) {
      return { error: 'Supabase failed', status: resp.status };
    }
    
    const shows = await resp.json();
    
    // 只处理第一条有 YouTube 链接的视频
    for (const show of shows) {
      const links = show.links || [];
      const youtubeLink = links.find(l => /youtube\.com|youtu\.be/.test(l.url));
      
      if (youtubeLink) {
        const videoId = extractYouTubeId(youtubeLink.url);
        if (videoId) {
          // 只测试 API 是否可达，不实际抓取
          return { 
            success: true,
            showId: show.id,
            title: show.title,
            videoId: videoId,
            youtubeUrl: youtubeLink.url,
            hasApiKey: !!env.YOUTUBE_API_KEY,
            totalShows: shows.length
          };
        }
      }
    }

    return { success: true, message: 'No YouTube links found in test shows', totalShows: shows.length };
    
  } catch (e) {
    return { error: 'Exception', message: e.message };
  }
}

function extractYouTubeId(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}
