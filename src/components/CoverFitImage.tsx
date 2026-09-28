import type { SyntheticEvent } from "react";

/**
 * 「完整显示 + 模糊背景」封面图：
 * - 底层：同一张图 object-cover 放大 110% + 高斯模糊，填满容器当背景；
 * - 顶层：object-contain 完整显示，不再裁切主体。
 * 图片比例接近容器时，模糊背景几乎被盖住，观感与纯 object-cover 一致；
 * 比例差异大（竖图人像、方形专辑封面等）时主体完整可见，露出的部分由同图模糊自然填充。
 * 两层 img 共用同一 src，浏览器只发一次请求。
 * 加载失败时返回 null（容器自己的占位背景色会透出来）。
 */
export default function CoverFitImage({
  src,
  alt,
  loading,
  onError,
  className = "",
}: {
  src: string;
  alt: string;
  loading?: "lazy" | "eager";
  /** 返回 true 表示 onError 内部已自行处理（如重试成功），组件不再隐藏 */
  onError?: (e: SyntheticEvent<HTMLImageElement>) => boolean | void;
  className?: string;
}) {
  const handleTopError = (e: SyntheticEvent<HTMLImageElement>) => {
    if (onError && onError(e)) return;
    e.currentTarget.style.display = "none";
    // 底层模糊图一并隐藏，交给容器占位背景
    const prev = e.currentTarget.previousElementSibling as HTMLImageElement | null;
    if (prev) prev.style.display = "none";
  };
  return (
    <>
      <img
        src={src}
        alt=""
        aria-hidden
        className={`absolute inset-0 w-full h-full object-cover scale-110 blur-lg pointer-events-none select-none ${className}`}
      />
      <img
        src={src}
        alt={alt}
        loading={loading}
        onError={handleTopError}
        className={`absolute inset-0 w-full h-full object-contain ${className}`}
      />
    </>
  );
}
