interface Env {}

function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function formatMelonDate(dateStr: string): string {
  if (!dateStr) return "";
  const clean = dateStr.trim().replace(/\./g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  if (/^\d{4}-\d{2}$/.test(clean)) return `${clean}-01`;
  return "";
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const artistId = url.searchParams.get("artistId");
  
  if (!artistId || !/^\d+$/.test(artistId)) {
    return new Response(JSON.stringify({ error: "缺少或无效的 artistId 参数" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const melonUrl = `https://www.melon.com/artist/songList.htm?artistId=${artistId}`;
    
    const res = await fetch(melonUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": `https://www.melon.com/artist/song.htm?artistId=${artistId}`,
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ 
        error: `Melon 返回 ${res.status}，可能是反爬限制。请使用手动批量导入模式。`,
        songs: [] 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const html = await res.text();
    
    if (!html.includes("ellipsis") && !html.includes("곡명")) {
      return new Response(JSON.stringify({ 
        error: "无法解析 Melon 页面，可能是反爬限制。请使用手动批量导入模式。",
        songs: [] 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const songs: any[] = [];
    const titleMatches = [...html.matchAll(/<a[^>]*class="ellipsis"[^>]*title="([^"]*)"[^>]*>/g)];
    const dateMatches = [...html.matchAll(/<td[^>]*class="t_center"[^>]*>([\d.]+)<\/td>/g)];
    
    for (let i = 0; i < titleMatches.length - 1; i += 2) {
      const title = decodeHtmlEntities(titleMatches[i][1]).trim();
      const album = decodeHtmlEntities(titleMatches[i + 1]?.[1] || "").trim();
      const date = dateMatches[Math.floor(i / 2)]?.[1] || "";
      
      if (title && title !== "곡명") {
        songs.push({
          title,
          album: album || "未知专辑",
          date: formatMelonDate(date),
          type: "团体",
          roles: ["演唱"],
          plays: "",
          link: "",
          isSelfComposed: false,
        });
      }
    }

    const seen = new Set();
    const unique = songs.filter(s => {
      const key = s.title + "|" + s.album;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return new Response(JSON.stringify({ 
      artistId, 
      songs: unique,
      count: unique.length,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, songs: [] }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
};
