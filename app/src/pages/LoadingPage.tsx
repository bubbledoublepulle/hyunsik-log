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
    <div className="fixed inset-0 bg-[#F8F9FA] flex flex-col items-center justify-center overflow-hidden">
      {/* Pulse background */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.15, 0.3],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute w-[600px] h-[600px] rounded-full bg-sky-200/30 blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.2, 0.1, 0.2],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.5,
        }}
        className="absolute w-[400px] h-[400px] rounded-full bg-sky-300/20 blur-2xl"
      />

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Connecting text */}
        <motion.p
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="text-sky-500/60 text-sm font-mono tracking-[0.3em] mb-6"
        >
          CONNECTING...
        </motion.p>

        {/* Brand name */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-6xl md:text-7xl font-black tracking-tighter mb-12"
          style={{ color: "#42B4E6" }}
        >
          Hyunsik.log
        </motion.h1>

        {/* Progress bar */}
        <div className="w-64 h-[3px] bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-sky-400 to-sky-600 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-gray-300 text-xs font-mono mt-3"
        >
          {Math.round(progress)}%
        </motion.p>
      </div>

      {/* Bottom belief */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="absolute bottom-12 text-center px-8"
        style={{ color: "#9CA3AF", fontSize: 14, letterSpacing: 2 }}
      >
        所思皆成真
      </motion.p>
    </div>
  );
}
