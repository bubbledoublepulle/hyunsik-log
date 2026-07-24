import { supabase, isSupabaseConfigured } from "./supabase";

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
  saveLocalMusicData(data);
  if (!isSupabaseConfigured()) return { error: null };

  // Upsert all current rows
  if (data.length > 0) {
    const { error } = await supabase.from("music").upsert(data.map(toDbRow), { onConflict: "id" });
    if (error) {
      console.warn("[music] save to supabase failed:", error.message);
      return { error: error.message };
    }
  }

  // Delete rows that no longer exist in current data
  const currentIds = data.map((d) => d.id);
  if (currentIds.length > 0) {
    const { error: delError } = await supabase
      .from("music")
      .delete()
      .not("id", "in", `(${currentIds.join(",")})`);
    if (delError) {
      console.warn("[music] delete stale rows failed:", delError.message);
    }
  }

  return { error: null };
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
