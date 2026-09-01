// functions/api/refresh-show.ts
// 刷新单个视频播放量

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const showId = url.searchParams.get('showId');

  if (!showId) {
    return new Response(JSON.stringify({ error: 'showId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const show = await getShowFromSupabase(env, showId);
    if (!show) {
      return new Response(JSON.stringify({ error: 'show not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const metadata = await scrapeShowMetadata(show, env);
    if (!metadata) {
      // 抓取失败，保留原值
      return new Response(JSON.stringify({
        success: true,
        updated: false,
        reason: 'fetch failed, preserving original value'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        }
      });
    }

    await updateShowInSupabase(env, showId, metadata);

    return new Response(JSON.stringify({
      success: true,
      updated: true,
      metadata
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
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

async function scrapeShowMetadata(show, env) {
  const links = show.links || [];
  const youtubeLink = links.find(l => /youtube\.com|youtu\.be/.test(l.url));
  if (!youtubeLink) return null;

  const videoId = extractYouTubeId(youtubeLink.url);
  if (!videoId) return null;

  if (env.YOUTUBE_API_KEY) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${env.YOUTUBE_API_KEY}`;
      const resp = await fetch(apiUrl);
      if (resp.ok) {
        const data = await resp.json();
        const item = data.items?.[0];
        if (item?.statistics?.viewCount) {
          return { views: formatViews(parseInt(item.statistics.viewCount, 10)) };
        }
      }
    } catch (e) {}
  }

  try {
    const resp = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId,
        context: { client: { clientName: 'WEB', clientVersion: '2.20240701.00.00', hl: 'en', gl: 'US' } }
      })
    });
    if (resp.ok) {
      const data = await resp.json();
      const vd = data.videoDetails;
      if (vd?.viewCount) {
        return { views: formatViews(parseInt(vd.viewCount, 10)) };
      }
    }
  } catch (e) {}

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
