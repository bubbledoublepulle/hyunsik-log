import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export default function LoadingPage() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return prev + 100 / 30; // 3 seconds, ~30 frames per second
      });
    }, 100);

    const redirectTimer = setTimeout(() => {
      navigate("/");
    }, 3000);

    return () => {
      clearInterval(timer);
      clearTimeout(redirectTimer);
    };
  }, [navigate]);

  return (
    <div className="fixed inset-0 bg-steel-100 flex flex-col items-center justify-center overflow-hidden">
      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundSize: '60px 60px',
          backgroundImage: `
            linear-gradient(to right, var(--grid-color) 1px, transparent 1px),
            linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px)
          `,
          maskImage: 'radial-gradient(circle at center, black 80%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black 80%, transparent 100%)',
        }}
      />

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Connecting text */}
        <motion.p
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="text-steel-500/60 text-xs font-mono tracking-[0.3em] mb-6 uppercase"
        >
          Connecting...
        </motion.p>

        {/* Brand name */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-6xl md:text-7xl font-serif italic text-steel-600 mb-12"
        >
          sik.log
        </motion.h1>

        {/* Progress bar */}
        <div className="w-64 h-[3px] bg-steel-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-steel-500 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-steel-300 text-xs font-mono mt-3"
        >
          {Math.round(progress)}%
        </motion.p>
      </div>

      {/* Bottom belief */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="absolute bottom-12 text-center px-8 text-steel-400 text-sm tracking-[0.2em] font-mono uppercase"
      >
        所思皆成真
      </motion.p>
    </div>
  );
}
