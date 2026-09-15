import { motion } from "framer-motion";

export default function PageLoader() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative"
      >
        <motion.img
          src="/logo.svg"
          alt="sik.log"
          className="w-16 h-16 object-contain"
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          style={{ filter: "brightness(0) invert(1)" }}
        />
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-steel-300/30"
          animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="mt-6 text-2xl font-serif italic text-steel-600"
      >
        sik.log
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        className="mt-2 text-xs font-mono uppercase tracking-[0.2em] text-steel-500/60"
      >
        加载档案中...
      </motion.p>
    </div>
  );
}
