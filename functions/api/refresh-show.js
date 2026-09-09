// functions/api/refresh-show.js
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
    const resp = await fetch(env.SUPABASE_URL + '/rest/v1/shows?id=eq.' + showId + '&select=*', {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
      },
    });
    
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'Supabase fetch failed' }), { status: 500 });
    }
    
    const data = await resp.json();
    const show = data[0];
    
    if (!show) {
      return new Response(JSON.stringify({ error: 'show not found' }), { status: 404 });
    }

    const links = show.links || [];
    const youtubeLink = links.find(l => /youtube\.com|youtu\.be/.test(l.url));
    
    if (!youtubeLink) {
      return new Response(JSON.stringify({ success: true, updated: false, reason: 'no YouTube link' }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    const videoId = extractYouTubeId(youtubeLink.url);
    if (!videoId) {
      return new Response(JSON.stringify({ success: true, updated: false, reason: 'invalid YouTube URL' }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    const views = await fetchViews(videoId, env.YOUTUBE_API_KEY);
    if (!views) {
      return new Response(JSON.stringify({ success: true, updated: false, reason: 'fetch failed, preserving original' }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    await updateShow(env, showId, views);

    return new Response(JSON.stringify({ success: true, updated: true, views }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
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
    } catch (e) {}
  }

  try {
    const resp = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId,
        context: { client: { clientName: 'WEB', clientVersion: '2.20240701.00.00', hl: 'en', gl: 'US' } }
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (resp.ok) {
      const data = await resp.json();
      const count = data.videoDetails?.viewCount;
      if (count) return formatViews(parseInt(count, 10));
    }
  } catch (e) {}

  return null;
}

async function updateShow(env, showId, views) {
  const resp = await fetch(env.SUPABASE_URL + '/rest/v1/shows?id=eq.' + showId, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ views }),
  });
  return resp.ok;
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
