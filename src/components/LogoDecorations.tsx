import { useEffect, useRef, useState } from "react";

const decorations = [
  { top: "15%", left: "10%", size: 32, opacity: 1, delay: "delay-100", anim: "animate-float-medium" },
  { top: "8%", left: "25%", size: 24, opacity: 1, delay: "delay-500", anim: "animate-float-slow" },
  { top: "20%", right: "15%", size: 40, opacity: 1, delay: "delay-300", anim: "animate-float-fast" },
  { top: "72%", left: "8%", size: 28, opacity: 1, delay: "delay-700", anim: "animate-float-slow" },
  { top: "68%", right: "12%", size: 36, opacity: 1, delay: "delay-1000", anim: "animate-float-medium" },
  { top: "45%", left: "4%", size: 20, opacity: 1, delay: "delay-300", anim: "animate-float-fast" },
  { top: "38%", right: "5%", size: 22, opacity: 1, delay: "delay-500", anim: "animate-float-medium" },
];

export default function LogoDecorations() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (window.innerWidth / 2 - e.clientX) / 50;
      const y = (window.innerHeight / 2 - e.clientY) / 50;
      setOffset({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 -z-[5] pointer-events-none overflow-hidden"
    >
      {decorations.map((item, index) => {
        const speed = (index + 1) * 0.5;
        return (
          <div
            key={index}
            className="absolute"
            style={{
              top: item.top,
              left: item.left,
              right: item.right,
              transform: `translate(${offset.x * speed}px, ${offset.y * speed}px)`,
              transition: "transform 0.2s ease-out",
            }}
          >
            <div
              className={`${item.anim} ${item.delay}`}
              style={{ width: item.size, height: item.size, opacity: item.opacity }}
            >
              <img
                src="/logo.svg"
                alt=""
                className="w-full h-full object-contain drop-shadow-sm"
                style={{
                  filter: "brightness(0) invert(1)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
