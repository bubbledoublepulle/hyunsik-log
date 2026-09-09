export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      const { offset, limit } = message.body;
      
      try {
        await processBatch(env, offset, limit);
        message.ack();
      } catch (e) {
        message.retry();
      }
    }
  }
};

async function processBatch(env, offset, limit) {
  const resp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/shows?select=*&order=created_at.desc&offset=${offset}&limit=${limit}`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  
  if (!resp.ok) throw new Error('Supabase failed');
  
  const shows = await resp.json();
  
  for (const show of shows) {
    await new Promise(r => setTimeout(r, 2000));
    
    try {
      const links = show.links || [];
      const youtubeLink = links.find(l => /youtube\.com|youtu\.be/.test(l.url));
      if (!youtubeLink) continue;

      const videoId = extractYouTubeId(youtubeLink.url);
      if (!videoId) continue;

      const views = await fetchViews(videoId, env.YOUTUBE_API_KEY);
      if (!views) continue;

      await updateShow(env, show.id, views);
    } catch (e) {}
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
  if (!resp.ok) throw new Error('Update failed');
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
