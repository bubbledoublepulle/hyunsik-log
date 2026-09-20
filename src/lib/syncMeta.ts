import { supabase, isSupabaseConfigured } from "./supabase";

export const SHOWS_META_ID = "shows";

/** 读取云端 shows 数据版本号；表/行不存在返回 null */
export async function readShowsVersion(): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase
    .from("sync_meta")
    .select("version")
    .eq("id", SHOWS_META_ID)
    .maybeSingle();
  if (error) {
    if (import.meta.env.DEV) console.warn("[syncMeta] read failed:", error.message);
    return null;
  }
  if (!data) {
    // 首次使用：补建行（忽略冲突）
    try {
      await supabase.from("sync_meta").insert({ id: SHOWS_META_ID, version: 0 });
    } catch {
      // ignore
    }
    return 0;
  }
  return Number(data.version);
}

export interface BumpResult {
  ok: boolean;
  current: number | null;
}

/** 条件递增：仅当当前版本 === expected 才 +1 */
export async function bumpShowsVersion(expected: number): Promise<BumpResult> {
  if (!isSupabaseConfigured()) return { ok: true, current: null };
  const { data, error } = await supabase
    .from("sync_meta")
    .update({ version: expected + 1, updated_at: new Date().toISOString() })
    .eq("id", SHOWS_META_ID)
    .eq("version", expected)
    .select("version");
  if (!error && data && data.length > 0) {
    return { ok: true, current: Number(data[0].version) };
  }
  return { ok: false, current: await readShowsVersion() };
}
