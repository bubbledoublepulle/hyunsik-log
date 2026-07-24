import { useEffect, useRef } from "react";
import { subscribeShowChanges, syncShowData } from "@/lib/showData";

export function useShowSync(onUpdate?: () => void) {
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    const unsubscribe = subscribeShowChanges((items) => {
      console.log("[sync] realtime update received, items:", items.length);
      cbRef.current?.();
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        syncShowData().then(() => cbRef.current?.()).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const timer = setInterval(() => {
      syncShowData().then(() => cbRef.current?.()).catch(() => {});
    }, 30000);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);
}
