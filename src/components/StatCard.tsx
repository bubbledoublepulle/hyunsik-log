import { motion } from "framer-motion";
import { Music, Disc3, Headphones, Sparkles } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bg: string;
  delay: number;
}

export function StatCard({ label, value, icon: Icon, color, bg, delay }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="relative overflow-hidden rounded-sm bg-white/40 border border-steel-200/60 shadow-sm p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-sm ${bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-steel-600 mb-0.5">{value}</p>
      <p className="text-xs font-mono uppercase tracking-[0.2em] opacity-60 text-steel-500">{label}</p>
    </motion.div>
  );
}

export const statIcons = { Music, Disc3, Headphones, Sparkles };
