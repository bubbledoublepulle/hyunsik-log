import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";

export default function Navbar() {
  const location = useLocation();
  useAuth(); // auth state is consumed by the HomePage logo toggle
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 60);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navItems = [
    { path: "/", label: "首页" },
    { path: "/music", label: "音乐" },
    { path: "/shows", label: "视频" },
    { path: "/social", label: "社交" },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 border-b ${
        scrolled
          ? "bg-steel-100/60 backdrop-blur-xl border-steel-200/40"
          : "bg-transparent backdrop-blur-none border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-20 flex items-center justify-between">
        {/* Left balance — keeps the center nav truly centered */}
        <div className="w-8 md:w-32 shrink-0" />

        {/* Navigation — centered, always one row */}
        <div className="flex-1 flex items-center justify-center gap-3 sm:gap-6 md:gap-12 overflow-x-auto no-scrollbar">
          {navItems.map(({ path, label }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`group relative py-2 text-base font-mono font-black uppercase tracking-[0.2em] transition-all shrink-0 ${
                  isActive
                    ? "text-[#4682b4]"
                    : "text-[#4682b4]/80 md:hover:text-[#4682b4] active:opacity-70"
                }`}
              >
                <span className="relative z-10">{label}</span>
                {isActive && (
                  <motion.div
                    layoutId="navUnderline"
                    className="absolute -bottom-0.5 left-0 right-0 h-[2px] bg-steel-500"
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  />
                )}
                {!isActive && (
                  <span className="absolute bottom-0 left-0 w-0 h-[3px] bg-[#8daabf] md:group-hover:w-full transition-all duration-300" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right balance — keeps the center nav truly centered */}
        <div className="w-8 md:w-32 shrink-0" />
      </div>
    </nav>
  );
}
