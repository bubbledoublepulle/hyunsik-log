import { supabase, isSupabaseConfigured } from "./supabase";

let saveMusicDataPromise: Promise<{ error: string | null }> | null = null;

export type MusicRole = "演唱" | "作曲" | "作词" | "编曲";
export type MusicType = "录音室" | "live" | "OST" | "合作" | "仅制作";

export interface MusicItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  releaseDate: string;
  type: MusicType;
  roles: MusicRole[];
  plays: string;
  link: string;
  isSelfComposed: boolean;
}

export const allTypes: MusicType[] = ["录音室", "live", "OST", "合作", "仅制作"];
export const allRoles: MusicRole[] = ["演唱", "作曲", "作词", "编曲"];

export const initialMusicData: MusicItem[] = [
  {
    id: "m01",
    title: "Missing You",
    artist: "비투비",
    album: "Brother Act.",
    releaseDate: "2017-10-16",
    type: "录音室",
    roles: ["演唱", "作曲", "作词"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
  {
    id: "m02",
    title: "Beautiful Pain",
    artist: "비투비",
    album: "Brother Act.",
    releaseDate: "2017-10-16",
    type: "录音室",
    roles: ["演唱", "作曲", "作词", "编曲"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
  {
    id: "m03",
    title: "The Girl",
    artist: "임현식",
    album: "Walk and Talk",
    releaseDate: "2024-02-29",
    type: "录音室",
    roles: ["演唱", "作曲", "作词", "编曲"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
  {
    id: "m04",
    title: "Sweety",
    artist: "임현식",
    album: "Sweety",
    releaseDate: "2023-04-03",
    type: "录音室",
    roles: ["演唱", "作曲", "作词"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
  {
    id: "m05",
    title: "Raining",
    artist: "임현식",
    album: "HR2",
    releaseDate: "2020-09-28",
    type: "录音室",
    roles: ["演唱", "作曲", "作词", "编曲"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
  {
    id: "m06",
    title: "Born to Beat",
    artist: "비투비",
    album: "Born to Beat",
    releaseDate: "2012-03-21",
    type: "录音室",
    roles: ["演唱"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: false,
  },
  {
    id: "m07",
    title: "Insane",
    artist: "비투비",
    album: "Born to Beat",
    releaseDate: "2012-03-21",
    type: "录音室",
    roles: ["演唱", "作曲"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: false,
  },
  {
    id: "m08",
    title: "Can't Come Back",
    artist: "비투비",
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
    artist: "임현식",
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
    artist: "임현식",
    album: "HR2",
    releaseDate: "2020-09-28",
    type: "录音室",
    roles: ["演唱", "作曲", "作词", "编曲"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: true,
  },
  {
    id: "m11",
    title: "Whatta Man",
    artist: "비투비",
    album: "WHATTAMAN",
    releaseDate: "2024-11-07",
    type: "录音室",
    roles: ["演唱", "作曲"],
    plays: "",
    link: "https://music.apple.com",
    isSelfComposed: false,
  },
  {
    id: "m12",
    title: "Time Traveler",
    artist: "임현식",
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

function toDbRow(item: MusicItem) {
  return {
    id: item.id,
    title: item.title,
    artist: item.artist,
    album: item.album,
    release_date: item.releaseDate,
    type: item.type,
    roles: item.roles,
    plays: item.plays,
    link: item.link,
    is_self_composed: item.isSelfComposed,
  };
}

function normalizeRoles(roles: unknown): MusicRole[] {
  if (Array.isArray(roles)) {
    return roles
      .map((r) => String(r).trim())
      .filter((r): r is MusicRole => allRoles.includes(r as MusicRole));
  }
  if (typeof roles === "string") {
    return roles
      .split(/[,，、]/)
      .map((r) => r.trim())
      .filter((r): r is MusicRole => allRoles.includes(r as MusicRole));
  }
  return [];
}

function normalizeType(type: unknown): MusicType {
  const str = String(type).trim();
  if (allTypes.includes(str as MusicType)) return str as MusicType;
  const lower = str.toLowerCase();
  const matched = allTypes.find((t) => t.toLowerCase() === lower);
  if (matched) return matched;
  return "录音室";
}

export function fromDbRow(row: Record<string, unknown>): MusicItem {
  return {
    id: String(row.id),
    title: String(row.title),
    artist: String(row.artist ?? ""),
    album: String(row.album),
    releaseDate: String(row.release_date),
    type: normalizeType(row.type),
    roles: normalizeRoles(row.roles),
    plays: String(row.plays ?? ""),
    link: String(row.link ?? ""),
    isSelfComposed: Boolean(row.is_self_composed),
  };
}

export function loadMusicData(): MusicItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return data.map((item: any) => ({
        ...item,
        artist: item.artist ?? "",
        roles: normalizeRoles(item.roles),
        type: normalizeType(item.type),
      }));
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

export async function syncMusicData(): Promise<MusicItem[]> {
  if (!isSupabaseConfigured()) {
    return loadMusicData();
  }

  const PAGE_SIZE = 100;
  let allRows: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("music")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.warn("[music] sync failed:", error.message);
      return loadMusicData();
    }

    if (data && data.length > 0) {
      allRows = allRows.concat(data);
      hasMore = data.length === PAGE_SIZE;
      from += PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  const items = allRows.map(fromDbRow);
  saveLocalMusicData(items);
  return items;
}

export async function saveMusicData(data: MusicItem[]): Promise<{ error: string | null }> {
  if (saveMusicDataPromise) {
    await saveMusicDataPromise;
  }

  saveMusicDataPromise = (async (): Promise<{ error: string | null }> => {
    saveLocalMusicData(data);
    if (!isSupabaseConfigured()) return { error: null };

    const BATCH_SIZE = 20;
    const rows = data.map(toDbRow);

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("music").upsert(batch, { onConflict: "id" });
      if (error) {
        console.warn(`[music] upsert batch ${i + 1}-${Math.min(i + BATCH_SIZE, rows.length)} failed:`, error.message);
        return { error: `保存批次 ${Math.floor(i / BATCH_SIZE) + 1} 失败: ${error.message}` };
      }
    }

    const currentIds = new Set(data.map((d) => d.id));
    const { data: remoteRows, error: fetchErr } = await supabase.from("music").select("id").limit(9995);
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
