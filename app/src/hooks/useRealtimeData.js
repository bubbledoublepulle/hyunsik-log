import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

export function useRealtimeData(tableName, options = {}) {
  const { orderBy = "created_at", ascending = false, limit = 100 } = options;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const channelRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: d, error: e } = await supabase.from(tableName).select("*").order(orderBy, { ascending }).limit(limit);
      if (e) throw e;
      setData(d || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [tableName, orderBy, ascending, limit]);

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
