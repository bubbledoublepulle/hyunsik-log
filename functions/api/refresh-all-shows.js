export async function onRequestPost(context) {
  const { env } = context;
  
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return jsonResponse({ error: 'Missing env vars' }, 500);
    }

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
    const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;
    
    const batchSize = 50;
    const batches = Math.ceil(total / batchSize);
    
    for (let i = 0; i < batches; i++) {
      await env.REFRESH_QUEUE.send({
        offset: i * batchSize,
        limit: batchSize,
      });
    }
    
    return jsonResponse({
      success: true,
      message: 'Refresh queued',
      total,
      batches,
      batchSize,
    });
    
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
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
