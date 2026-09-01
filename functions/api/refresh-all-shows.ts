// functions/api/refresh-all-shows.ts
// 批量刷新 YouTube 播放量（简化版，避免超时）

export async function onRequestPost(context) {
  const { env } = context;
  
  // 每批处理 5 条，避免超时
  const BATCH_SIZE = 5;
  const DELAY_MS = 1000;
  
  let updated = 0, failed = 0, skipped = 0;
  const errors: any[] = [];

  try {
    // 获取 shows
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/shows?select=*`, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    });
    
    if (!resp.ok) {
      return jsonError('Failed to fetch shows from Supabase', resp.status);
    }
    
    const shows = await resp.json();

    // 分批处理
    for (let i = 0; i < shows.length; i += BATCH_SIZE) {
      const batch = shows.slice(i, i + BATCH_SIZE);
      
      // 并行处理每批
      await Promise.all(batch.map(async (show: any) => {
        try {
          const result = await processShow(show, env);
          if (result === 'updated') updated++;
          else if (result === 'skipped') skipped++;
          else failed++;
        } catch (e: any) {
          failed++;
          errors.push({ id: show.id, title: show.title, error: e.message });
        }
      }));
      
      // 批次间延迟
      if (i + BATCH_SIZE < shows.length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    return new Response(JSON.stringify({
      updated,
      failed,
      skipped,
      total: shows.length,
      errors: errors.slice(0, 5)
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    });
    
  } catch (e: any) {
    return jsonError(e.message, 500);
  }
}

async function processShow(show: any, env: any): Promise<string> {
  const links = show.links || [];
  const youtubeLink = links.find((l: any) => /youtube\.com|youtu\.be/.test(l.url));
  
  if (!youtubeLink) return 'skipped';

  const videoId = extractYouTubeId(youtubeLink.url);
  if (!videoId) return 'skipped';

  // 优先 YouTube Data API
  const views = await fetchViews(videoId, env.YOUTUBE_API_KEY);
  if (!views) return 'skipped';

  // 更新 Supabase
  const ok = await updateShow(env, show.id, views);
  return ok ? 'updated' : 'failed';
}

async function fetchViews(videoId: string, apiKey: string | undefined): Promise<string | null> {
  // 方法1: Data API
  if (apiKey) {
    try {
      const resp = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${apiKey}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (resp.ok) {
        const data = await resp.json();
        const count = data.items?.[0]?.statistics?.viewCount;
        if (count) return formatViews(parseInt(count, 10));
      }
    } catch {}
  }

  // 方法2: 内部 API
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
  } catch {}

  return null;
}

async function updateShow(env: any, showId: string, views: string): Promise<boolean> {
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

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function formatViews(views: number): string {
  if (views >= 100000000) return `${(views / 100000000).toFixed(1).replace(/\.0$/, '')}亿`;
  if (views >= 10000) return `${(views / 10000).toFixed(1).replace(/\.0$/, '')}万`;
  return views.toLocaleString();
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
