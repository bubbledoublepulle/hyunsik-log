import type { NormalizedVideoRef } from "./urlNormalize";

/** 由规范化引用派生确定性 ID（同一视频重复导入得到同一 ID） */
export function makeShowId(ref: NormalizedVideoRef): string {
  return ref.platform === "youtube" ? `s_yt_${ref.videoKey}` : `s_bl_${ref.videoKey}`;
}

/** 手工添加 / 无法解析平台时的随机 ID */
export function makeManualShowId(): string {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, "0");
  return `s_man_${t}_${r}`;
}

/**
 * 为一批规范化引用分配 ID，保证在 existingIds + 本批次内唯一。
 * 若某 dedupeKey 已存在于 existingByKey 中，复用其 ID（幂等 upsert）。
 */
export function assignBatchIds(
  refs: NormalizedVideoRef[],
  existingIds: Set<string>,
  existingByKey?: Map<string, string>
): Map<string, string> {
  const used = new Set(existingIds);
  const result = new Map<string, string>(); // dedupeKey -> id

  for (const ref of refs) {
    const reused = existingByKey?.get(ref.dedupeKey);
    if (reused) {
      result.set(ref.dedupeKey, reused);
      used.add(reused);
      continue;
    }

    let id = makeShowId(ref);
    let n = 2;
    while (used.has(id)) {
      id = `${makeShowId(ref)}_${n++}`;
    }
    used.add(id);
    result.set(ref.dedupeKey, id);
  }

  return result;
}
