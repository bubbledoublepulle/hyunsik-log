/**
 * 卡片 hover 装饰图标的统一常量（首页 + 音乐档案页共用，避免两处尺寸/样式走偏）。
 */

/** BTOB 官方 logo（已下载为本地静态资源 public/btob-logo.svg） */
export const BTOB_LOGO_URL = "/btob-logo.svg";

/**
 * 装饰图标统一以 BTOB logo 的显示高度（24px）为基准。
 * 行星图（logo.svg，334×196）除了中间的圆球，左右还有伸出的斜轨道，
 * 实测圆球外沿直径约 163px（上下壁 y15→179、左右壁 x87→248），仅占画布宽度的 48.8%。
 * 所以要让「圆球」看起来和 BTOB 图标一样大，必须按这个比例反推整图宽度。
 */
export const DECOR_BTOB_HEIGHT = 24;
export const PLANET_BALL_RATIO = 163 / 334;
export const PLANET_WIDTH = Math.round(DECOR_BTOB_HEIGHT / PLANET_BALL_RATIO); // ≈ 49px

/** 两种图标共用的投影：白色图形在任何封面上都清晰 */
export const DECOR_SHADOW = "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))";
