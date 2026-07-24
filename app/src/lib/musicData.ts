import { supabase, isSupabaseConfigured } from "./supabase";

// 全局锁，防止 saveMusicData 并发执行导致数据竞态
let saveMusicDataPromise: Promise<{ error: string | null }> | null = null;

export type MusicRole = "演唱" | "作曲" | "作词" | "编曲";
export type MusicType = "团体" | "SOLO" | "OST" | "合作";

export interface MusicItem {
  id: string;
  title: string;
  album: string;
  releaseDate: string;
  type: MusicType;
  roles: MusicRole[];
  plays: string;
  link: string;
  isSelfComposed: boolean;
}

export const initialMusicData: MusicItem[] = [
  {
    id: "m01",
    title: "Missing You",
    album: "Brother Act.",
    releaseDate: "2017-10-16",
    type: "团体",
    roles: ["演唱", "作曲", "作词"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
  {
    id: "m02",
    title: "Beautiful Pain",
    album: "Brother Act.",
    releaseDate: "2017-10-16",
    type: "团体",
    roles: ["演唱", "作曲", "作词", "编曲"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
  {
    id: "m03",
    title: "The Girl",
    album: "Walk and Talk",
    releaseDate: "2024-02-29",
    type: "SOLO",
    roles: ["演唱", "作曲", "作词", "编曲"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
  {
    id: "m04",
    title: "Sweety",
    album: "Sweety",
    releaseDate: "2023-04-03",
    type: "SOLO",
    roles: ["演唱", "作曲", "作词"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
  {
    id: "m05",
    title: "Raining",
    album: "HR2",
    releaseDate: "2020-09-28",
    type: "SOLO",
    roles: ["演唱", "作曲", "作词", "编曲"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
  {
    id: "m06",
    title: "Born to Beat",
    album: "Born to Beat",
    releaseDate: "2012-03-21",
    type: "团体",
    roles: ["演唱"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: false,
  },
  {
    id: "m07",
    title: "Insane",
    album: "Born to Beat",
    releaseDate: "2012-03-21",
    type: "团体",
    roles: ["演唱", "作曲"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: false,
  },
  {
    id: "m08",
    title: "Can't Come Back",
    album: "Press Play",
    releaseDate: "2016-02-29",
    type: "OST",
    roles: ["演唱", "作曲", "作词"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
  {
    id: "m09",
    title: "Melody",
    album: "Melody",
    releaseDate: "2025-01-20",
    type: "合作",
    roles: ["演唱", "作曲", "作词"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
  {
    id: "m10",
    title: "Star",
    album: "HR2",
    releaseDate: "2020-09-28",
    type: "SOLO",
    roles: ["演唱", "作曲", "作词", "编曲"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
  {
    id: "m11",
    title: "Whatta Man",
    album: "WHATTAMAN",
    releaseDate: "2024-11-07",
    type: "团体",
    roles: ["演唱", "作曲"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: false,
  },
  {
    id: "m12",
    title: "Time Traveler",
    album: "OST",
    releaseDate: "2023-07-15",
    type: "OST",
    roles: ["演唱", "作曲", "作词", "编曲"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
];

const STORAGE_KEY = "hsik_music_data";

// ─── 数据库 ↔ 前端 类型转换 ───

function toDbRow(item: MusicItem) {
  return {
    id: item.id,
    title: item.title,
    album: item.album,
    release_date: item.releaseDate,
    type: item.type,
    roles: item.roles,
    plays: item.plays,
    link: item.link,
    is_self_composed: item.isSelfComposed,
  };
}

export function fromDbRow(row: Record<string, unknown>): MusicItem {
  return {
    id: String(row.id),
    title: String(row.title),
    album: String(row.album),
    releaseDate: String(row.release_date),
    type: String(row.type) as MusicType,
    roles: Array.isArray(row.roles) ? (row.roles as string[]).map(String) as MusicRole[] : [],
    plays: String(row.plays ?? ""),
    link: String(row.link ?? ""),
    isSelfComposed: Boolean(row.is_self_composed),
  };
}

// ─── localStorage（本地缓存） ───

export function loadMusicData(): MusicItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore parse errors
  }
  return [...initialMusicData];
}

function saveLocalMusicData(data: MusicItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

// ─── Supabase 读写 ───

export async function syncMusicData(): Promise<MusicItem[]> {
  if (!isSupabaseConfigured()) {
    return loadMusicData();
  }
  const { data, error } = await supabase.from("music").select("*").order("created_at", { ascending: false });
  if (error) {
    console.warn("[music] sync failed:", error.message);
    return loadMusicData();
  }
  const items = (data || []).map(fromDbRow);
  saveLocalMusicData(items);
  return items;
}

export async function saveMusicData(data: MusicItem[]): Promise<{ error: string | null }> {
  // 如果已有保存正在进行，等待它完成后再执行新的，避免并发竞态
  if (saveMusicDataPromise) {
    await saveMusicDataPromise;
  }

  saveMusicDataPromise = (async (): Promise<{ error: string | null }> => {
    saveLocalMusicData(data);
    if (!isSupabaseConfigured()) return { error: null };

  const BATCH_SIZE = 20;
  const rows = data.map(toDbRow);

  // 分批 upsert，避免单请求过大导致超时或失败
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("music").upsert(batch, { onConflict: "id" });
    if (error) {
      console.warn(`[music] upsert batch ${i + 1}-${Math.min(i + BATCH_SIZE, rows.length)} failed:`, error.message);
      return { error: `保存批次 ${Math.floor(i / BATCH_SIZE) + 1} 失败: ${error.message}` };
    }
  }

  // 分批 delete：先获取所有远程 ID，找出不在 currentIds 中的，分批删除
  const currentIds = new Set(data.map((d) => d.id));
  const { data: remoteRows, error: fetchErr } = await supabase.from("music").select("id");
  if (fetchErr) {
    console.warn("[music] fetch ids for delete failed:", fetchErr.message);
    return { error: null };
  }

  const idsToDelete = (remoteRows || [])
    .filter((r: any) => !currentIds.has(r.id))
    .map((r: any) => r.id);

  for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
    const batch = idsToDelete.slice(i, i + BATCH_SIZE);
    const { error: delError } = await supabase.from("music").delete().in("id", batch);
    if (delError) {
      console.warn("[music] delete batch failed:", delError.message);
    }
  }

    return { error: null };
  })();

  const result = await saveMusicDataPromise;
  saveMusicDataPromise = null;
  return result;
}

export async function addMusicItem(item: MusicItem): Promise<void> {
  const current = loadMusicData();
  const updated = [...current, item];
  await saveMusicData(updated);
}

export async function updateMusicItem(item: MusicItem): Promise<void> {
  const current = loadMusicData();
  const updated = current.map((m) => (m.id === item.id ? item : m));
  await saveMusicData(updated);
}

export async function deleteMusicItem(id: string): Promise<void> {
  const current = loadMusicData();
  const updated = current.filter((m) => m.id !== id);
  saveLocalMusicData(updated);
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.from("music").delete().eq("id", id);
  if (error) {
    console.warn("[music] delete from supabase failed:", error.message);
  }
}

export async function resetMusicData(): Promise<MusicItem[]> {
  const data = [...initialMusicData];
  await saveMusicData(data);
  return data;
}

/** 将当前 localStorage 中的数据批量导入 Supabase */
export async function migrateMusicToSupabase(): Promise<{ success: number; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { success: 0, error: "Supabase 未配置" };
  }
  const items = loadMusicData();
  if (items.length === 0) return { success: 0, error: null };
  const { error } = await supabase.from("music").upsert(items.map(toDbRow), { onConflict: "id" });
  if (error) return { success: 0, error: error.message };
  return { success: items.length, error: null };
}
