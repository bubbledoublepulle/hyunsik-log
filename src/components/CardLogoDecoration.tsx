import { BTOB_LOGO_URL, DECOR_BTOB_HEIGHT, DECOR_SHADOW, PLANET_WIDTH } from "@/lib/cardDecor";

/**
 * 卡片 hover 时右上角出现的装饰图标（首页「那年今日 / 随机品熊」与音乐档案页共用同一套）。
 * 规则：歌手含 BTOB → BTOB 官方 logo；其余 → 行星 logo。
 * 两种图标以 BTOB logo 为主体基准（显示高度 24px），同为白色、同一款投影；
 * 行星图带左右斜轨道，圆球只占画布宽 48.8%，所以按 49px 整图宽渲染，保证「圆球」视觉大小一致。
 */
export default function CardLogoDecoration({ artist }: { artist?: string }) {
  const isBtob = (artist ?? "").toUpperCase().includes("BTOB");
  return (
    <div className="absolute top-3 right-3 w-[52px] h-8 flex items-center justify-center opacity-0 scale-50 -rotate-12 group-hover:opacity-100 group-hover:scale-100 group-hover:rotate-0 transition-all duration-300 pointer-events-none">
      <img
        src={isBtob ? BTOB_LOGO_URL : "/logo.svg"}
        alt=""
        className="block"
        style={
          isBtob
            ? { height: DECOR_BTOB_HEIGHT, width: "auto", filter: `brightness(0) invert(1) ${DECOR_SHADOW}` }
            : { width: PLANET_WIDTH, height: "auto", filter: DECOR_SHADOW }
        }
      />
    </div>
  );
}
