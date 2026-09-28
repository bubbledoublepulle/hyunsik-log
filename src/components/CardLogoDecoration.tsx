import { BTOB_LOGO_URL, DECOR_BTOB_HEIGHT, DECOR_SHADOW, PLANET_WIDTH } from "@/lib/cardDecor";

/**
 * 卡片 hover 时右上角出现的装饰图标（首页「那年今日 / 随机品熊」与音乐档案页共用同一套）。
 * btob=true → BTOB 官方 logo；false → 行星 logo。判定交给调用方（cardDecor 的 isBtobByText / isBtobByMembers）。
 * 两种图标以 BTOB logo 为主体基准（显示高度 24px），同为白色、同一款投影；
 * 行星圆环是细线条镂空图形，同尺寸视觉偏轻，故整图按 52px 宽渲染（圆径 ≈25px，+6% 视觉补偿），
 * 容器相应放宽到 64×36 并居中，保证两种图标的视觉中心重合。
 */
export default function CardLogoDecoration({ btob = false }: { btob?: boolean }) {
  const isBtob = btob;
  return (
    <div className="absolute top-3 right-3 w-16 h-9 flex items-center justify-center opacity-0 scale-50 -rotate-12 group-hover:opacity-100 group-hover:scale-100 group-hover:rotate-0 transition-all duration-300 pointer-events-none">
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
