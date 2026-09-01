export async function onRequestPost(context) {
  const { env } = context;
  
  try {
    const resp = await fetch(env.SUPABASE_URL + "/rest/v1/shows?select=*", {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
      },
    });
    
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'Supabase fetch failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const shows = await resp.json();
    let updated = 0, failed = 0, skipped = 0;

    for (let i = 0; i < shows.length; i++) {
      const show = shows[i];
      if (i > 0) await new Promise(r => setTimeout(r, 2000));

      try {
        const links = show.links || [];
        const youtubeLink = links.find(l => /youtube\.com|youtu\.be/.test(l.url));
        if (!youtubeLink) { skipped++; continue; }

        const videoId = extractYouTubeId(youtubeLink.url);
        if (!videoId) { skipped++; continue; }

        const views = await fetchViews(videoId, env.YOUTUBE_API_KEY);
        if (!views) { skipped++; continue; }

        const ok = await updateShow(env, show.id, views);
        if (ok) updated++; else failed++;
      } catch (e) { failed++; }
    }

    return new Response(JSON.stringify({
      updated, failed, skipped, total: shows.length
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
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

async function updateShow(env
