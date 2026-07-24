import { useEffect, useRef } from "react";
import { subscribeShowChanges, checkRemoteUpdates } from "@/lib/showData";

/**
 * 视频档案馆自动同步 Hook
 * 1. Supabase Realtime — 数据变化即时推送
 * 2. 页面聚焦 — 用户切回页面时自动检查更新
 * 3. 定时轮询 — 每 30 秒检查一次
 */
export function useShowSync(onUpdate?: () => void) {
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    const unsubscribe = subscribeShowChanges((items) => cbRef.current?.());

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        checkRemoteUpdates().then((updated) => { if (updated) cbRef.current?.(); });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const timer = setInterval(() => {
      checkRemoteUpdates().then((updated) => { if (updated) cbRef.current?.(); });
    }, 30000);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);
}
