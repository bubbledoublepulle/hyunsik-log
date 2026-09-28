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
