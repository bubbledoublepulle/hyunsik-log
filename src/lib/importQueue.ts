import type { ShowItem } from "./showData";

const QUEUE_KEY = "hsik_import_queue_v1";
const PREVIEW_KEY = "hsik_import_preview_v1";
const MAX_RETRY = 5;
const DONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SERIALIZED_BYTES = 1_500_000;

export type ImportJobStatus = "pending" | "saving" | "done" | "failed";

export interface ImportJob {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: ImportJobStatus;
  retryCount: number;
  /** 下次可重试的时间戳（指数退避） */
  nextRetryAt: number;
  lastError: string | null;
  /** 入队时所见的云端版本号，重试时用于乐观锁 */
  expectedVersion: number | null;
  items: ShowItem[];
}

export interface ImportQueue {
  version: 1;
  jobs: ImportJob[];
}

export interface ImportPreviewDraft {
  version: 1;
  createdAt: number;
  items: ShowItem[];
  duplicates: { dedupeKey: string; url: string; existingShowId: string }[];
}

function generateJobId(): string {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, "0");
  return `job_${t}_${r}`;
}

export function loadImportQueue(): ImportQueue {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return { version: 1, jobs: [] };
    const parsed = JSON.parse(raw) as ImportQueue;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.jobs)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return { version: 1, jobs: [] };
}

function pruneFinished(q: ImportQueue): ImportQueue {
  const now = Date.now();
  const jobs = q.jobs.filter((j) => {
    if (j.status === "done") return now - j.updatedAt < DONE_TTL_MS;
    if (j.status === "failed" && j.retryCount >= MAX_RETRY) return false;
    return true;
  });
  return { ...q, jobs };
}

function enforceSizeLimit(q: ImportQueue): ImportQueue {
  try {
    const serialized = JSON.stringify(q);
    if (serialized.length <= MAX_SERIALIZED_BYTES) return q;
  } catch {
    return q;
  }

  // 按 updatedAt 从旧到新排序，优先裁剪 done/failed 老任务
  const sorted = [...q.jobs].sort((a, b) => a.updatedAt - b.updatedAt);
  const keep: ImportJob[] = [];
  let bytes = 2; // `{}`

  for (const job of sorted) {
    if (job.status === "pending" || job.status === "saving") {
      keep.push(job);
      continue;
    }
    const jobBytes = JSON.stringify(job).length;
    if (bytes + jobBytes + (keep.length > 0 ? 1 : 0) <= MAX_SERIALIZED_BYTES) {
      keep.push(job);
      bytes += jobBytes + (keep.length > 1 ? 1 : 0);
    }
  }

  return { version: 1, jobs: keep.sort((a, b) => b.createdAt - a.createdAt) };
}

export function saveImportQueue(q: ImportQueue): void {
  try {
    const pruned = pruneFinished(q);
    const limited = enforceSizeLimit(pruned);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(limited));
  } catch {
    // ignore storage errors
  }
}

export function loadPreviewDraft(): ImportPreviewDraft | null {
  try {
    const raw = localStorage.getItem(PREVIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImportPreviewDraft;
    if (parsed && parsed.version === 1 && parsed.createdAt) {
      if (Date.now() - parsed.createdAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(PREVIEW_KEY);
        return null;
      }
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function savePreviewDraft(d: ImportPreviewDraft): void {
  try {
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(d));
  } catch {
    // ignore
  }
}

export function clearPreviewDraft(): void {
  try {
    localStorage.removeItem(PREVIEW_KEY);
  } catch {
    // ignore
  }
}

export function backoffMs(retryCount: number): number {
  return Math.min(5 * 60 * 1000, 5000 * 2 ** Math.max(0, retryCount));
}

function withMutator(fn: (q: ImportQueue) => ImportQueue): void {
  const q = loadImportQueue();
  saveImportQueue(fn(q));
}

export function enqueueImportJob(
  items: ShowItem[],
  expectedVersion: number | null
): string {
  const id = generateJobId();
  const now = Date.now();
  const job: ImportJob = {
    id,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    retryCount: 0,
    nextRetryAt: now,
    lastError: null,
    expectedVersion,
    items,
  };
  withMutator((q) => ({ ...q, jobs: [job, ...q.jobs] }));
  return id;
}

export function patchJob(id: string, patch: Partial<ImportJob>): void {
  withMutator((q) => ({
    ...q,
    jobs: q.jobs.map((j) => (j.id === id ? { ...j, ...patch, updatedAt: Date.now() } : j)),
  }));
}

export function markSaving(id: string): void {
  patchJob(id, { status: "saving", lastError: null });
}

export function markDone(id: string): void {
  patchJob(id, { status: "done", lastError: null });
}

export function markFailed(id: string, err: string): void {
  const q = loadImportQueue();
  const job = q.jobs.find((j) => j.id === id);
  if (!job) return;
  const retryCount = job.retryCount + 1;
  const dead = retryCount >= MAX_RETRY;
  patchJob(id, {
    status: dead ? "failed" : "pending",
    retryCount,
    nextRetryAt: dead ? Number.MAX_SAFE_INTEGER : Date.now() + backoffMs(job.retryCount),
    lastError: err,
  });
}

export function removeJob(id: string): void {
  withMutator((q) => ({ ...q, jobs: q.jobs.filter((j) => j.id !== id) }));
}

export function clearFinishedJobs(): void {
  withMutator((q) => ({ ...q, jobs: q.jobs.filter((j) => j.status !== "done" && !isDead(j)) }));
}

export function getRetryableJobs(q: ImportQueue): ImportJob[] {
  const now = Date.now();
  return q.jobs.filter(
    (j) =>
      j.status !== "done" &&
      j.nextRetryAt <= now &&
      j.retryCount < MAX_RETRY
  );
}

export function isDead(job: ImportJob): boolean {
  return job.status === "failed" && job.retryCount >= MAX_RETRY;
}
