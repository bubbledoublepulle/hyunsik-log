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
    
    for (let i = 0; i < batches
