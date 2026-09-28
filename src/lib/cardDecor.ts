/**
 * 卡片 hover 装饰图标的统一常量（首页 + 音乐档案页共用，避免两处尺寸/样式走偏）。
 */

/** BTOB 官方 logo（已下载为本地静态资源 public/btob-logo.svg） */
export const BTOB_LOGO_URL = "/btob-logo.svg";

/**
 * 装饰图标统一以 BTOB logo 的显示高度（24px）为基准。
 * 行星图（logo.svg，334×196，内嵌位图）中间的圆环外沿直径约 161-163px，
 * 仅占画布宽度的 ~48.2%，按比例反推 49px 时圆径 ≈ 23.6px，数值上已等于 BTOB 的 24px；
 * 但圆环是 ~1.5px 的细线条且中间镂空（实测数据：BTOB 实心 22.2×24.0 vs 圆环线条），
 * 同尺寸下视觉分量明显更轻，因此额外加视觉补偿：补偿系数 1.06（52px → 圆径 ≈25px），
 * 是「49px 偏小 / 55px 偏大」之间的折中值，再微调只需改 PLANET_VISUAL_BOOST。
 */
export const DECOR_BTOB_HEIGHT = 24;
export const PLANET_BALL_RATIO = 163 / 334;
export const PLANET_VISUAL_BOOST = 1.06;
export const PLANET_WIDTH = Math.round(
  (DECOR_BTOB_HEIGHT / PLANET_BALL_RATIO) * PLANET_VISUAL_BOOST,
); // ≈ 52px

/** 两种图标共用的投影：白色图形在任何封面上都清晰 */
export const DECOR_SHADOW = "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))";

/**
 * hover 图标用哪一张？规则：
 * - 社交卡：只看**正文**（原文 + 译文）里是否出现下列成员关键词；作者名/id、成员字段、
 *   以及正文里的 "BTOB" / #BTOB 字样**都不算**（比如任炫植 solo 广播带团体 tag 的情况）。
 * - 音乐卡：歌手 / 专辑 / 标题里出现下列关键词，或歌手就是 BTOB → BTOB logo。
 * - 视频卡：只有「成员标签恰好是任炫植一个」才用行星图，其余（任炫植 + 别人、只有别人、无标签）→ BTOB logo。
 */
export const BTOB_TEXT_KEYWORDS = [
  // 恩光 / 旼赫 / Peniel
  "徐恩光",
  "SEOEUNKWANG",
  "李旼赫",
  "LEEMINHYUK",
  "PENIEL",
  // 昌燮（韩文全名 + 名字片段 + 中文名/简称）
  "이창섭",
  "창섭",
  "李昌燮",
  "昌燮",
  // 星材
  "육성재",
  "성재",
  "陆星材",
  "星材",
] as const;

/** 归一：英文转大写并去掉空格/连字符等，让 "Seo Eunkwang"、"SEO-EUNKWANG" 都能命中 */
function normalizeText(s: string): string {
  return s.toUpperCase().replace(/[\s\-_./·•,]/g, "");
}

function matchesMemberKeywords(raw: string): boolean {
  const norm = normalizeText(raw);
  return BTOB_TEXT_KEYWORDS.some((k) => {
    const key = k.trim(); // 兼容 " 창섭" 这类带空格的写法
    // 英文关键词：忽略大小写与空格/连字符；中韩文：按原文包含匹配
    return /^[A-Z]+$/.test(key) ? norm.includes(key) : raw.includes(key);
  });
}

/** 社交卡：正文命中成员关键词才用 BTOB logo；正文里的 "BTOB" 字样不触发 */
export function isBtobByText(...parts: (string | null | undefined)[]): boolean {
  const raw = parts.filter(Boolean).join(" ");
  if (!raw.trim()) return false;
  return matchesMemberKeywords(raw);
}

/** 音乐卡：命中成员关键词，或歌手本身就是 BTOB（用户最早定的规则）→ BTOB logo */
export function isBtobByArtist(...parts: (string | null | undefined)[]): boolean {
  return isBtobByText(...parts) || normalizeText(parts.filter(Boolean).join(" ")).includes("BTOB");
}

/** 视频卡：仅「成员标签恰好 = 任炫植」时用行星图，其余一律 BTOB logo */
export const SOLO_MEMBER = "任炫植";
export function isBtobByMembers(members?: readonly string[] | null): boolean {
  const list = (members ?? []).map((m) => m.trim()).filter(Boolean);
  if (list.length === 0) return true;
  return !(list.length === 1 && list[0] === SOLO_MEMBER);
}
