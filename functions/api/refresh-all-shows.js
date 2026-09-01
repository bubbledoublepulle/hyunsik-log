export async function onRequestPost(context) {
  const { env } = context;
  
  try {
    // 检查环境变量
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return new Response(JSON.stringify({ 
        error: 'Missing environment variables',
        supabase_url: !!env.SUPABASE_URL,
        supabase_key: !!env.SUPABASE_SERVICE_KEY
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 测试 Supabase 连接
    const resp = await fetch(env.SUPABASE_URL + "/rest/v1/shows?select=id,title,links&limit=1", {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
      },
    });
    
    if (!resp.ok) {
      return new Response(JSON.stringify({ 
        error: 'Supabase connection failed',
        status: resp.status 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const shows = await resp.json();
    
    // 只处理第一条视频作为测试
    const show = shows[0];
    let result = { test: true, showFound: !!show };
    
    if (show) {
      const links = show.links || [];
      const youtubeLink = links.find(l => /youtube\.com|youtu\.be/.test(l.url));
      
      if (youtubeLink) {
        const videoId = extractYouTubeId(youtubeLink.url);
        if (videoId) {
          const views = await fetchViews(videoId, env.YOUTUBE_API_KEY);
          result = { ...result, videoId, views: views || 'failed' };
        } else {
          result = { ...result, error: 'Could not extract videoId' };
        }
      } else {
        result = { ...result, error: 'No YouTube link' };
      }
    }

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    });
    
  } catch (e) {
    return new Response(JSON.stringify({ 
      error: 'Exception',
      message: e.message,
      stack: e.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function fetchViews(videoId, apiKey) {
  if (apiKey) {
    try {
      const url = 'https://www.googleapis.com/youtube/v3/videos?part=statistics&id=' + videoId + '&key=' + apiKey;
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = await resp.json();
        const count = data.items?.[0]?.statistics?.viewCount;
        if (count) return formatViews(parseInt(count, 10));
      }
    } catch (e) { return e.message; }
  }
  return null;
}

function extractYouTubeId(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function formatViews(views) {
  if (views >= 100000000) return Math.round(views / 100000000) + '亿';
  if (views >= 10000) return Math.round(views / 10000) + '万';
  return views.toLocaleString();
}
