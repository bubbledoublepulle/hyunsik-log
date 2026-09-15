import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { User, ShieldCheck, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Navbar() {
  const location = useLocation();
  const { isAdmin, setAuthModalOpen, logout } = useAuth();
  const isAdminDomain = typeof window !== "undefined" && window.location.hostname === "siklog.work" || window.location.hostname === "www.siklog.work";

  const navItems = [
    { path: "/", label: "首页" },
    { path: "/music", label: "音乐" },
    { path: "/shows", label: "视频" },
    { path: "/social", label: "社交" },
  ];

  const handleIdentityClick = () => {
    if (isAdmin) {
      logout();
      toast.success("已退出管理模式", {
        description: "已恢复访客身份",
      });
    } else {
      setAuthModalOpen(true);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-steel-100/60 backdrop-blur-xl border-b border-steel-200/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 md:h-20 flex items-center justify-between">
        {/* Left spacer - hidden on mobile */}
        <div className="hidden md:block w-32" />

        {/* Navigation - centered */}
        <div className="flex-1 flex items-center justify-center gap-6 md:gap-12">
          {navItems.map(({ path, label }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`group relative py-1 text-[11px] md:text-xs font-mono font-bold uppercase tracking-[0.2em] transition-all ${
                  isActive
                    ? "text-steel-600"
                    : "text-steel-500/70 hover:text-steel-600"
                }`}
              >
                <span className="relative z-10">{label}</span>
                {isActive && (
                  <motion.div
                    layoutId="navUnderline"
                    className="absolute -bottom-1 left-0 right-0 h-[1px] bg-steel-500"
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  />
                )}
                {!isActive && (
                  <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-steel-400 group-hover:w-full transition-all duration-300" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Identity - only on admin domain */}
        {isAdminDomain && (
          <button
            onClick={handleIdentityClick}
            className={`hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border transition-all w-32 justify-center ${
              isAdmin
                ? "border-steel-300 bg-white/50 text-steel-600 hover:bg-white/70"
                : "border-steel-200 bg-white/30 text-steel-500 hover:bg-white/50"
            }`}
          >
            {isAdmin ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>管理员</span>
                <LogOut className="w-3 h-3 ml-0.5 opacity-60" />
              </>
            ) : (
              <>
                <User className="w-3.5 h-3.5" />
                <span>访客</span>
              </>
            )}
          </button>
        )}

        {/* Mobile: keep a minimal right spacer or nothing */}
        {!isAdminDomain && <div className="w-8 md:hidden" />}
      </div>

      {/* Mobile nav */}
      <div className="md:hidden flex items-center justify-center gap-4 pb-2 px-4">
        {navItems.map(({ path, label }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`px-3 py-1.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
                isActive
                  ? "text-steel-600 border-b border-steel-400"
                  : "text-steel-500/70"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
