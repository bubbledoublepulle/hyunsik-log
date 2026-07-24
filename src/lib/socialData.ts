import type { ShowMember } from "./showData";
import { supabase, isSupabaseConfigured } from "./supabase";

/** 社交动态分类标签（二选一） */
export type SocialCategory = "个人动态" | "官方动态";

/** 社交平台（实际发布平台） */
export type SocialPlatform =
  | "X"
  | "Instagram"
  | "fromm"
  | "bubble"
  | "Weverse"
  | "YouTube Community"
  | "Fan Club";

export interface SocialPost {
  id: string;
  /** 分类标签（多选） */
  categories?: SocialCategory[];
  /** 主分类（兼容旧数据） */
  category?: SocialCategory;
  /** 实际发布平台 */
  platform: SocialPlatform;
  /** 发布者名称 */
  author: string;
  /** 相关成员（用于成员筛选，可选） */
  member?: ShowMember;
  /** 文字内容 */
  content: string;
  /** 图片列表（URL 或空数组） */
  images: string[];
  /** 视频列表（URL 或空数组） */
  videos?: string[];
  /** 原帖链接 */
  postUrl: string;
  /** 发布日期 ISO 字符串 */
  postDate: string;
  /** 是否置顶 */
  pinned?: boolean;
}

export const socialCategories: { key: SocialCategory; label: string; desc: string }[] = [
  { key: "个人动态", label: "个人动态", desc: "成员个人发布的内容" },
  { key: "官方动态", label: "官方动态", desc: "官方账号发布的动态" },
];

/** 平台样式映射 */
export const platformVisualStyles: Record<
  SocialPlatform,
  { bg: string; text: string; label: string; gradient: string }
> = {
  X: {
    bg: "bg-gray-900",
    text: "text-white",
    label: "X",
    gradient: "from-gray-700 to-gray-900",
  },
  Instagram: {
    bg: "bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400",
    text: "text-white",
    label: "Instagram",
    gradient: "from-purple-500 via-pink-500 to-orange-400",
  },
  fromm: {
    bg: "bg-rose-500",
    text: "text-white",
    label: "fromm",
    gradient: "from-rose-400 to-rose-600",
  },
  bubble: {
    bg: "bg-sky-500",
    text: "text-white",
    label: "bubble",
    gradient: "from-sky-400 to-sky-600",
  },
  Weverse: {
    bg: "bg-blue-600",
    text: "text-white",
    label: "Weverse",
    gradient: "from-blue-500 to-blue-700",
  },
  "YouTube Community": {
    bg: "bg-red-600",
    text: "text-white",
    label: "YouTube",
    gradient: "from-red-500 to-red-700",
  },
  "Fan Club": {
    bg: "bg-amber-500",
    text: "text-white",
    label: "Fan Club",
    gradient: "from-amber-400 to-amber-600",
  },
};

/** 分类标签的视觉样式 */
export const categoryStyles: Record<
  SocialCategory,
  { active: string; inactive: string; dot: string }
> = {
  个人动态: {
    active: "bg-sky-500 text-white border-sky-500",
    inactive: "bg-white text-sky-600 border-sky-200 hover:border-sky-400",
    dot: "bg-sky-500",
  },
  官方动态: {
    active: "bg-violet-500 text-white border-violet-500",
    inactive: "bg-white text-violet-600 border-violet-200 hover:border-violet-400",
    dot: "bg-violet-500",
  },
};

/** 所有可选平台列表 */
export const allPlatforms: SocialPlatform[] = [
  "X",
  "Instagram",
  "fromm",
  "bubble",
  "Weverse",
  "YouTube Community",
  "Fan Club",
];

/** 分类 → 对应平台映射（兼容旧代码） */
export const categoryToPlatforms: Record<string, SocialPlatform[]> = {
  个人动态: ["Weverse", "YouTube Community", "bubble"],
  官方动态: ["Weverse", "X", "YouTube Community"],
  X: ["X"],
  Instagram: ["Instagram"],
  fromm: ["fromm", "bubble"],
  FC发帖: ["Fan Club"],
};

export const initialSocialData: SocialPost[] = [
  {
    id: "p01",
    categories: ["个人动态"],
    platform: "X",
    author: "@HSIK_INBLUE",
    member: "任炫植",
    content:
      "深夜录音室 session 刚结束，今天写了一段很喜欢的旋律。等不及想跟你们分享了 🎵 #BTOB #任炫植",
    images: [],
    postUrl: "https://x.com",
    postDate: "2025-07-18T23:30:00+09:00",
  },
  {
    id: "p02",
    category: "个人动态",
    platform: "Instagram",
    author: "@imhyunsik",
    member: "任炫植",
    content:
      "今天的海边散步 🌊\n天气很好，风也很温柔。\n希望大家也有美好的一天！",
    images: [
      "https://picsum.photos/seed/hsik1/600/800",
      "https://picsum.photos/seed/hsik2/600/600",
    ],
    postUrl: "https://instagram.com",
    postDate: "2025-07-16T15:00:00+09:00",
  },
  {
    id: "p03",
    category: "个人动态",
    platform: "Weverse",
    author: "任炫植",
    member: "任炫植",
    content:
      "梅尔们～新专辑的准备工作正在进行中！虽然不能说太多，但这次真的花了很多心思在制作上。请期待！💚",
    images: ["https://picsum.photos/seed/hsik3/800/600"],
    postUrl: "https://weverse.io",
    postDate: "2025-07-14T20:15:00+09:00",
  },
  {
    id: "p04",
    category: "个人动态",
    platform: "fromm",
    author: "炫植",
    member: "任炫植",
    content:
      "今天练了吉他练到手指有点痛了…\n但是想到新歌完成的那一刻就觉得一切都值得！\n晚安，好好休息哦 💤",
    images: [],
    postUrl: "https://fromm.jp",
    postDate: "2025-07-13T23:45:00+09:00",
  },
  {
    id: "p05",
    categories: ["官方动态"],
    platform: "Weverse",
    author: "BTOB Official",
    content:
      "【BTOB 官方公告】\n任炫植 Solo 专辑《The Young Man and the Deep Sea》发行纪念特别直播将于 7/20 晚 8 点(KST)在 Weverse 进行直播。\n敬请期待！",
    images: ["https://picsum.photos/seed/hsik5/800/500"],
    postUrl: "https://weverse.io",
    postDate: "2025-07-12T10:00:00+09:00",
  },
  {
    id: "p06",
    category: "官方动态",
    platform: "Fan Club",
    author: "BTOB Fan Club",
    content:
      "【Fan Club 限定】\n7月会员特典：任炫植亲笔签名照 + 夏季问候卡已寄出！\n请留意邮箱查收～",
    images: [
      "https://picsum.photos/seed/hsik6/500/700",
      "https://picsum.photos/seed/hsik7/500/500",
      "https://picsum.photos/seed/hsik8/500/600",
    ],
    postUrl: "https://btodofficial.com/fanclub",
    postDate: "2025-07-10T14:00:00+09:00",
  },
  {
    id: "p07",
    categories: ["个人动态"],
    platform: "X",
    author: "@BTOBofficial",
    content:
      "BTOB 12th Anniversary Season's Greetings 2025 予約受付開始！\n今年も最高の一年を一緒に 🎉\n#BTOB #BTOB12주년",
    images: ["https://picsum.photos/seed/hsik9/800/600"],
    postUrl: "https://x.com",
    postDate: "2025-07-08T09:00:00+09:00",
  },
  {
    id: "p08",
    category: "个人动态",
    platform: "Instagram",
    author: "@btodofficial",
    member: "全体",
    content:
      "BTOB 12周年记念 🎂\n12年間、ありがとうございます！\nこれからもずっと一緒に。\n#BTOB #12thAnniversary",
    images: [
      "https://picsum.photos/seed/hsik10/600/600",
      "https://picsum.photos/seed/hsik11/600/800",
      "https://picsum.photos/seed/hsik12/600/600",
      "https://picsum.photos/seed/hsik13/600/500",
    ],
    postUrl: "https://instagram.com",
    postDate: "2025-07-06T18:00:00+09:00",
  },
  {
    id: "p09",
    categories: ["个人动态"],
    platform: "bubble",
    author: "炫植",
    member: "任炫植",
    content:
      "梅尔们～刚结束今天的行程回家啦！\n虽然有点累但是看到你们的留言就觉得充电满了 ⚡\n明天也要加油！",
    images: [],
    postUrl: "https://bubble.jpfan.com",
    postDate: "2025-07-05T22:30:00+09:00",
  },
  {
    id: "p10",
    category: "个人动态",
    platform: "YouTube Community",
    author: "任炫植",
    member: "任炫植",
    content:
      "大家好！新曲的制作花絮视频已经在剪辑中了，应该下周就能和大家见面。\n这次记录了很多创作过程中的真实想法和感受，希望你们会喜欢！",
    images: ["https://picsum.photos/seed/hsik14/800/500"],
    postUrl: "https://youtube.com",
    postDate: "2025-07-03T16:00:00+09:00",
  },
  {
    id: "p11",
    category: "官方动态",
    platform: "Fan Club",
    author: "BTOB Fan Club",
    content:
      "【FC限定動画配信】\n任炫植 Solo 专辑 Recording Making Film Part.1 已上线！\nFan Club 会员可在限定期间内观看。",
    images: [],
    postUrl: "https://btodofficial.com/fanclub",
    postDate: "2025-06-28T12:00:00+09:00",
  },
  {
    id: "p12",
    category: "官方动态",
    platform: "X",
    author: "@cube_btob",
    content:
      "【告知】任炫植 Solo 专辑『The Young Man and the Deep Sea』Track List 公开！\n全曲 作曲/编曲: 任炫植\n7/20 各音源サイトリリース",
    images: ["https://picsum.photos/seed/hsik15/800/800"],
    postUrl: "https://x.com",
    postDate: "2025-06-25T10:00:00+09:00",
  },
];

const STORAGE_KEY = "hsik_social_data";

// ─── 数据库 ↔ 前端 类型转换 ───

function toDbRow(post: SocialPost) {
  return {
    id: post.id,
    category: post.category,
    platform: post.platform,
    author: post.author,
    member: post.member ?? null,
    content: post.content,
    images: post.images,
    videos: post.videos ?? [],
    post_url: post.postUrl,
    post_date: post.postDate,
    pinned: post.pinned ?? false,
  };
}

function fromDbRow(row: Record<string, unknown>): SocialPost {
  return {
    id: String(row.id),
    category: String(row.category) as SocialCategory,
    platform: String(row.platform) as SocialPlatform,
    author: String(row.author),
    member: row.member ? String(row.member) as ShowMember : undefined,
    content: String(row.content),
    images: Array.isArray(row.images) ? (row.images as string[]).map(String) : [],
    videos: Array.isArray(row.videos) ? (row.videos as string[]).map(String) : [],
    postUrl: String(row.post_url ?? ""),
    postDate: String(row.post_date),
    pinned: Boolean(row.pinned),
  };
}

// ─── localStorage（本地缓存） ───

/** 数据迁移：确保所有帖子都有 videos 字段 */
function migrateSocialData(data: SocialPost[]): SocialPost[] {
  for (const post of data) {
    if (!Array.isArray(post.videos)) {
      (post as unknown as Record<string, unknown>).videos = [];
    }
  }
  return data;
}

export function loadSocialData(): SocialPost[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return migrateSocialData(parsed);
    }
  } catch {
    // ignore
  }
  return migrateSocialData(JSON.parse(JSON.stringify(initialSocialData)));
}

function saveLocalSocialData(data: SocialPost[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

// ─── Supabase 读写 ───

export async function syncSocialData(): Promise<SocialPost[]> {
  if (!isSupabaseConfigured()) {
    return loadSocialData();
  }
  const { data, error } = await supabase.from("social_posts").select("*").order("created_at", { ascending: false });
  if (error) {
    console.warn("[social] sync failed:", error.message);
    return loadSocialData();
  }
  const items = (data || []).map(fromDbRow);
  saveLocalSocialData(items);
  return items;
}

export async function saveSocialData(data: SocialPost[]): Promise<{ error: string | null }> {
  saveLocalSocialData(data);
  if (!isSupabaseConfigured()) return { error: null };

  // Upsert all current rows
  if (data.length > 0) {
    const { error } = await supabase.from("social_posts").upsert(data.map(toDbRow), { onConflict: "id" });
    if (error) {
      console.warn("[social] save to supabase failed:", error.message);
      return { error: error.message };
    }
  }

  // Delete rows that no longer exist in current data
  const currentIds = data.map((d) => d.id);
  if (currentIds.length > 0) {
    const { error: delError } = await supabase
      .from("social_posts")
      .delete()
      .not("id", "in", `(${currentIds.join(",")})`);
    if (delError) {
      console.warn("[social] delete stale rows failed:", delError.message);
    }
  }

  return { error: null };
}

export async function addSocialPost(post: SocialPost): Promise<void> {
  const current = loadSocialData();
  const updated = [...current, post];
  await saveSocialData(updated);
}

export async function updateSocialPost(post: SocialPost): Promise<void> {
  const current = loadSocialData();
  const updated = current.map((p) => (p.id === post.id ? post : p));
  await saveSocialData(updated);
}

export async function deleteSocialPost(id: string): Promise<void> {
  const current = loadSocialData();
  const updated = current.filter((p) => p.id !== id);
  saveLocalSocialData(updated);
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.from("social_posts").delete().eq("id", id);
  if (error) {
    console.warn("[social] delete from supabase failed:", error.message);
  }
}

export async function resetSocialData(): Promise<SocialPost[]> {
  const data = migrateSocialData(JSON.parse(JSON.stringify(initialSocialData)));
  await saveSocialData(data);
  return data;
}

/** 将当前 localStorage 中的数据批量导入 Supabase */
export async function migrateSocialToSupabase(): Promise<{ success: number; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { success: 0, error: "Supabase 未配置" };
  }
  const items = loadSocialData();
  if (items.length === 0) return { success: 0, error: null };
  const { error } = await supabase.from("social_posts").upsert(items.map(toDbRow), { onConflict: "id" });
  if (error) return { success: 0, error: error.message };
  return { success: items.length, error: null };
}

/** 格式化日期为相对时间 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay < 7) return `${diffDay} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

/** 格式化日期为绝对时间 */
export function formatAbsoluteTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
