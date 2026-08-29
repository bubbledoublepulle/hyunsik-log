import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

export function useRealtimeData(tableName, options = {}) {
  const { orderBy = "created_at", ascending = false } = options;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const channelRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // 分页获取所有数据，突破 100 条限制
      const PAGE_SIZE = 100;
      let allRows = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: d, error: e } = await supabase
          .from(tableName)
          .select("*")
          .order(orderBy, { ascending })
          .range(from, from + PAGE_SIZE - 1);

        if (e) throw e;
        if (d && d.length > 0) {
          allRows = allRows.concat(d);
          hasMore = d.length === PAGE_SIZE;
          from += PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      setData(allRows);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [tableName, orderBy, ascending]);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel(`${tableName}-rt-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tableName }, (payload) => {
        const { eventType, new: n, old: o } = payload;
        setData(prev => {
          let next = [...prev];
          if (eventType === "INSERT") { if (!next.find(i => i.id === n.id)) next = [n, ...next]; }
          else if (eventType === "UPDATE") next = next.map(i => i.id === n.id ? { ...i, ...n } : i);
          else if (eventType === "DELETE") next = next.filter(i => i.id !== o.id);
          return next;
        });
      })
      .subscribe(s => setIsSubscribed(s === "SUBSCRIBED"));
    channelRef.current = channel;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [tableName]);

  return { data, loading, error, isSubscribed };
}
