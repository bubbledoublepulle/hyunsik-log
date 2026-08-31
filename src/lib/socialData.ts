// src/lib/socialData.ts
// 社交数据管理模块

import { supabase } from "@/integrations/supabase/client";

// ==================== 类型定义 ====================

export interface SocialPost {
  id: string;
  title: string;
  content: string;
  platform: SocialPlatform;
  category: SocialCategory;
  url?: string;
  imageUrl?: string;
  videoUrls?: string[];
  likes: number;
  comments: number;
  shares: number;
  views: number;
  createdAt: string;
  updatedAt: string;
  isPublished: boolean;
  tags?: string[];
}

export type SocialPlatform = 
  | "weibo" 
  | "wechat" 
  | "xiaohongshu" 
  | "douyin" 
  | "bilibili" 
  | "twitter" 
  | "instagram" 
  | "youtube" 
  | "tiktok" 
  | "linkedin";

export type SocialCategory = 
  | "promotion" 
  | "behindTheScenes" 
  | "interaction" 
  | "announcement" 
  | "review" 
  | "other";

// ==================== 平台配置 ====================

export const allPlatforms: SocialPlatform[] = [
  "weibo",
  "wechat",
  "xiaohongshu",
  "douyin",
  "bilibili",
  "twitter",
  "instagram",
  "youtube",
  "tiktok",
  "linkedin",
];

export const platformVisualStyles: Record<SocialPlatform, { 
  label: string; 
  color: string; 
  bgColor: string;
  icon: string;
}> = {
  weibo: { label: "微博", color: "#E6162D", bgColor: "#FEE2E2", icon: "🔴" },
  wechat: { label: "微信", color: "#07C160", bgColor: "#DCFCE7", icon: "💬" },
  xiaohongshu: { label: "小红书", color: "#FF2442", bgColor: "#FEE2E2", icon: "📕" },
  douyin: { label: "抖音", color: "#000000", bgColor: "#F3F4F6", icon: "🎵" },
  bilibili: { label: "B站", color: "#00A1D6", bgColor: "#DBEAFE", icon: "📺" },
  twitter: { label: "Twitter", color: "#1DA1F2", bgColor: "#DBEAFE", icon: "🐦" },
  instagram: { label: "Instagram", color: "#E4405F", bgColor: "#FEE2E2", icon: "📷" },
  youtube: { label: "YouTube", color: "#FF0000", bgColor: "#FEE2E2", icon: "▶️" },
  tiktok: { label: "TikTok", color: "#000000", bgColor: "#F3F4F6", icon: "🎵" },
  linkedin: { label: "LinkedIn", color: "#0A66C2", bgColor: "#DBEAFE", icon: "💼" },
};

// 兼容旧名称
export const platformStyles = platformVisualStyles;

// ==================== 分类配置 ====================

export const socialCategories: { value: SocialCategory; label: string }[] = [
  { value: "promotion", label: "剧目宣传" },
  { value: "behindTheScenes", label: "幕后花絮" },
  { value: "interaction", label: "粉丝互动" },
  { value: "announcement", label: "活动公告" },
  { value: "review", label: "观后感/评论" },
  { value: "other", label: "其他" },
];

export const categoryStyles: Record<SocialCategory, { 
  label: string; 
  color: string; 
  bgColor: string;
}> = {
  promotion: { label: "剧目宣传", color: "#7C3AED", bgColor: "#EDE9FE" },
  behindTheScenes: { label: "幕后花絮", color: "#059669", bgColor: "#D1FAE5" },
  interaction: { label: "粉丝互动", color: "#DC2626", bgColor: "#FEE2E2" },
  announcement: { label: "活动公告", color: "#2563EB", bgColor: "#DBEAFE" },
  review: { label: "观后感/评论", color: "#D97706", bgColor: "#FEF3C7" },
  other: { label: "其他", color: "#6B7280", bgColor: "#F3F4F6" },
};

// ==================== 本地存储 ====================

const STORAGE_KEY = "social_posts_data";

export function loadSocialData(): SocialPost[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data) as SocialPost[];
    }
  } catch {
    // 解析失败返回空数组
  }
  return [];
}

export function saveSocialData(posts: SocialPost[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

// ==================== Supabase 同步 ====================

export async function syncSocialData(posts: SocialPost[]): Promise<SocialPost[]> {
  try {
    const { data, error } = await supabase
      .from("social_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Supabase 同步失败，使用本地数据:", error.message);
      return posts;
    }

    if (data && data.length > 0) {
      const syncedPosts: SocialPost[] = data.map((item: any) => ({
        id: item.id,
        title: item.title || "",
        content: item.content || "",
        platform: item.platform || "weibo",
        category: item.category || "other",
        url: item.url,
        imageUrl: item.image_url,
        videoUrls: item.video_urls || [],
        likes: item.likes || 0,
        comments: item.comments || 0,
        shares: item.shares || 0,
        views: item.views || 0,
        createdAt: item.created_at || new Date().toISOString(),
        updatedAt: item.updated_at || new Date().toISOString(),
        isPublished: item.is_published ?? true,
        tags: item.tags || [],
      }));
      saveSocialData(syncedPosts);
      return syncedPosts;
    }

    if (posts.length > 0) {
      await migrateSocialToSupabase(posts);
    }

    return posts;
  } catch (err) {
    console.warn("同步异常，使用本地数据:", err);
    return posts;
  }
}

export async function migrateSocialToSupabase(posts: SocialPost[]): Promise<void> {
  try {
    const records = posts.map((post) => ({
      id: post.id,
      title: post.title,
      content: post.content,
      platform: post.platform,
      category: post.category,
      url: post.url,
      image_url: post.imageUrl,
      video_urls: post.videoUrls,
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
      views: post.views,
      created_at: post.createdAt,
      updated_at: post.updatedAt,
      is_published: post.isPublished,
      tags: post.tags,
    }));

    const { error } = await supabase.from("social_posts").upsert(records);
    if (error) {
      console.warn("迁移到 Supabase 失败:", error.message);
    }
  } catch (err) {
    console.warn("迁移异常:", err);
  }
}

// ==================== 时间格式化 ====================

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}周前`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}个月前`;
  return `${Math.floor(diffDay / 365)}年前`;
}

export function formatAbsoluteTime(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}
