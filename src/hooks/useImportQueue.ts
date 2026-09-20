import { useCallback, useEffect, useRef, useState } from "react";
import type { ShowItem } from "@/lib/showData";
import {
  loadImportQueue,
  enqueueImportJob,
  markSaving,
  markDone,
  markFailed,
  getRetryableJobs,
  clearFinishedJobs,
  removeJob,
  type ImportJob,
} from "@/lib/importQueue";

export interface CommitOutcome {
  ok: boolean;
  retriable: boolean;
  error?: string;
}

export interface UseImportQueueOptions {
  enabled?: boolean;
  intervalMs?: number;
}

export interface UseImportQueueReturn {
  jobs: ImportJob[];
  pendingCount: number;
  savingCount: number;
  deadCount: number;
  flush: () => Promise<void>;
  enqueue: (items: ShowItem[], expectedVersion: number | null) => string;
  remove: (id: string) => void;
  clearFinished: () => void;
}

export function useImportQueue(
  commit: (items: ShowItem[], expectedVersion: number | null) => Promise<CommitOutcome>,
  opts: UseImportQueueOptions = {}
): UseImportQueueReturn {
  const { enabled = true, intervalMs = 60_000 } = opts;
  const [jobs, setJobs] = useState<ImportJob[]>(() => loadImportQueue().jobs);
  const flushingRef = useRef(false);
  const commitRef = useRef(commit);

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  const refresh = useCallback(() => {
    setJobs(loadImportQueue().jobs);
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      const retryable = getRetryableJobs(loadImportQueue());
      for (const job of retryable) {
        markSaving(job.id);
        refresh();
        const r = await commitRef.current(job.items, job.expectedVersion);
        if (r.ok) {
          markDone(job.id);
        } else if (r.retriable) {
          markFailed(job.id, r.error ?? "网络错误");
        } else {
          markFailed(job.id, r.error ?? "不可重试错误");
        }
        refresh();
      }
    } finally {
      flushingRef.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;

    refresh();
    flush();

    const onOnline = () => flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => {
      if (getRetryableJobs(loadImportQueue()).length > 0) flush();
    }, intervalMs);

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [enabled, intervalMs, flush, refresh]);

  const enqueue = useCallback((items: ShowItem[], expectedVersion: number | null): string => {
    const id = enqueueImportJob(items, expectedVersion);
    refresh();
    return id;
  }, [refresh]);

  const remove = useCallback((id: string) => {
    removeJob(id);
    refresh();
  }, [refresh]);

  const clearFinished = useCallback(() => {
    clearFinishedJobs();
    refresh();
  }, [refresh]);

  const pendingCount = jobs.filter((j) => j.status === "pending").length;
  const savingCount = jobs.filter((j) => j.status === "saving").length;
  const deadCount = jobs.filter((j) => j.status === "failed" && j.retryCount >= 5).length;

  return { jobs, pendingCount, savingCount, deadCount, flush, enqueue, remove, clearFinished };
}
