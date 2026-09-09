export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId');

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return new Response(JSON.stringify({ error: 'Invalid videoId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ========== 方法1: YouTube 内部 API (innertube) ==========
  try {
    const resp = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
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

      // 关键修复：innertube 可能返回空数据，检查 title 是否有效
      if (!data.error && data.videoDetails?.title) {
        const videoDetails = data.videoDetails;
        const microformat = data.microformat?.playerMicroformatRenderer;

        let thumbnail = '';
        if (videoDetails?.thumbnail?.thumbnails) {
          const thumbs = videoDetails.thumbnail.thumbnails;
          thumbnail = thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || '';
        }

        return new Response(JSON.stringify({
          title: videoDetails.title,
          viewCount: parseInt(videoDetails?.viewCount || '0', 10),
          lengthSeconds: parseInt(videoDetails?.lengthSeconds || '0', 10),
          publishedAt: microformat?.publishDate || microformat?.uploadDate || '',
          thumbnail: thumbnail,
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      }
      // 如果 innertube 返回了空 title，继续 fallback 到方法2
      console.log('innertube returned empty data, falling back to Data API');
    }
  } catch (e) {
    console.log('YouTube internal API failed:', e.message);
  }

  // ========== 方法2: YouTube Data API v3 (需要配置 YOUTUBE_API_KEY) ==========
  if (env.YOUTUBE_API_KEY) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${env.YOUTUBE_API_KEY}`;
      const resp = await fetch(apiUrl);

      if (resp.ok) {
        const data = await resp.json();
        const item = data.items?.[0];

        if (item) {
          const snippet = item.snippet;
          const stats = item.statistics;
          const content = item.contentDetails;

          // 解析 ISO 8601 时长 (PT4M30S -> 秒数)
          let lengthSeconds = 0;
          if (content?.duration) {
            const match = content.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (match) {
              const h = parseInt(match[1] || '0', 10);
              const m = parseInt(match[2] || '0', 10);
              const s = parseInt(match[3] || '0', 10);
              lengthSeconds = h * 3600 + m * 60 + s;
            }
          }

          return new Response(JSON.stringify({
            title: snippet?.title || '',
            viewCount: parseInt(stats?.viewCount || '0', 10),
            lengthSeconds: lengthSeconds,
            publishedAt: snippet?.publishedAt || '',
            thumbnail: snippet?.thumbnails?.maxres?.url || snippet?.thumbnails?.high?.url || snippet?.thumbnails?.medium?.url || snippet?.thumbnails?.default?.url || '',
          }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=3600'
            }
          });
        }
      }
    } catch (e) {
      console.log('YouTube Data API failed:', e.message);
    }
  }

  // ========== 方法3: 返回空对象，让前端 fallback 到 oEmbed ==========
  // 关键修复：不要返回 500，前端对 500 会 return null 不再继续
  // 返回空数据，前端会合并 oEmbed 保底数据
  return new Response(JSON.stringify({
    title: '',
    viewCount: 0,
    lengthSeconds: 0,
    publishedAt: '',
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
