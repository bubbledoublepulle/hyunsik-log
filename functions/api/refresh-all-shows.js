export async function onRequestPost(context) {
  const { env } = context;
  const url = new URL(context.request.url);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return jsonResponse({ error: 'Missing env vars' }, 500);
    }

    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/shows?select=*&order=created_at.desc&offset=${offset}&limit=${limit}`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    
    if (!resp.ok) {
      return jsonResponse({ error: 'Supabase failed', status: resp.status }, 500);
    }
    
    const shows = await resp.json();
    
    const countResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/shows?select=count`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'count=exact',
        },
      }
    );
    
    const contentRange = countResp.headers.get('content-range') || '';
    const totalMatch = contentRange.match(/\/(\d+)/);
    const total = totalMatch ? parseInt(totalMatch[1], 10) : shows.length;

    let updated = 0, failed = 0, skipped = 0;

    await Promise.all(shows.map(async (show) => {
      try {
        const links = show.links || [];
        const youtubeLink = links.find(l => /youtube\.com|youtu\.be/.test(l.url));
        if (!youtubeLink) { skipped++; return; }

        const videoId = extractYouTubeId(youtubeLink.url);
        if (!videoId) { skipped++; return; }

        const views = await fetchViews(videoId, env.YOUTUBE_API_KEY);
        if (!views) { skipped++; return; }

        const ok = await updateShow(env, show.id, views);
        if (ok) updated++; else failed++;
      } catch (e) { failed++; }
    }));

    return jsonResponse({
      updated,
      failed,
      skipped,
      processed: shows.length,
      offset,
      limit,
      total,
      hasMore: offset + shows.length < total,
      nextOffset: offset + shows.length
    });
    
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

async function fetchViews(videoId, apiKey) {
  if (apiKey) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${apiKey}`;
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
  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/shows?id=eq.${showId}`, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
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

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    }
  });
}
