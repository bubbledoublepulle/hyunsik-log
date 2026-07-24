import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Music, Tv, Home, User, ShieldCheck, LogOut, MessageCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Navbar() {
  const location = useLocation();
  const { isAdmin, setAuthModalOpen, logout } = useAuth();
  const isAdminDomain = typeof window !== "undefined" && window.location.hostname === "hyunsik-log.siklog.workers.dev";

  const navItems = [
    { path: "/", label: "首页", icon: Home },
    { path: "/music", label: "音乐档案", icon: Music },
    { path: "/shows", label: "视频档案馆", icon: Tv },
    { path: "/social", label: "社交动态", icon: MessageCircle },
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
    <nav className="fixed top-0 left-0 right-0 z-40 bg-white/70 backdrop-blur-xl border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 bg-gradient-to-br from-sky-400 to-sky-600 rounded-lg flex items-center justify-center shadow-md shadow-sky-200 group-hover:shadow-lg transition-shadow overflow-hidden">
            <img src="/logo.svg" alt="Logo" className="w-6 h-6 object-contain" />
          </div>
          <span className="text-lg font-bold text-gray-900 tracking-tight">
            sik.log
          </span>
        </Link>

        {/* Navigation */}
        <div className="hidden md:flex items-center gap-1">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "text-sky-600"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Icon className="w-4 h-4" />
                  {label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="navIndicator"
                    className="absolute inset-0 bg-sky-50 rounded-lg -z-10"
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Identity - only on admin domain */}
        {isAdminDomain && (
          <button
            onClick={handleIdentityClick}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
              isAdmin
                ? "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            {isAdmin ? (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>管理员</span>
                <LogOut className="w-3.5 h-3.5 ml-0.5 text-sky-400" />
              </>
            ) : (
              <>
                <User className="w-4 h-4" />
                <span>访客</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Mobile nav */}
      <div className="md:hidden flex items-center justify-center gap-1 pb-2 px-4">
        {navItems.map(({ path, label }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? "bg-sky-50 text-sky-600"
                  : "text-gray-500"
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
