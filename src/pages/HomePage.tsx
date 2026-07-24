import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Music,
  ArrowRight,
  Sparkles,
  Calendar,
  TrendingUp,
  Disc3,
  Film,
  MessageCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { loadMusicData, syncMusicData, type MusicItem } from "@/lib/musicData";
import { loadShowData, syncShowData, type ShowItem } from "@/lib/showData";
import { loadSocialData, syncSocialData, type SocialPost } from "@/lib/socialData";
import DataManager from "@/components/DataManager";

interface UpdateItem {
  id: string;
  source: "music" | "show" | "social";
  icon: typeof Music;
  tag: string;
  tagColor: string;
  title: string;
  desc: string;
  date: string;
  link: string;
}

type TabKey = "music" | "show" | "social";

const TAB_CONFIG: { key: TabKey; label: string; icon: typeof Music; color: string; activeColor: string; link: string }[] = [
  { key: "music", label: "音乐", icon: Disc3, color: "border-sky-200 text-sky-600 bg-sky-50", activeColor: "border-sky-400 text-sky-700 bg-sky-100", link: "/music" },
  { key: "show", label: "视频", icon: Film, color: "border-violet-200 text-violet-600 bg-violet-50", activeColor: "border-violet-400 text-violet-700 bg-violet-100", link: "/shows" },
  { key: "social", label: "社交", icon: MessageCircle, color: "border-rose-200 text-rose-600 bg-rose-50", activeColor: "border-rose-400 text-rose-700 bg-rose-100", link: "/social" },
];

export default function HomePage() {
  const { isAdmin, setAuthModalOpen } = useAuth();
  const isAdminDomain = typeof window !== "undefined" && window.location.hostname === "hyunsik-log.siklog.workers.dev";
  const navigate = useNavigate();
  const [groupedUpdates, setGroupedUpdates] = useState<Record<TabKey, UpdateItem[]>>({
    music: [],
    show: [],
    social: [],
  });
  const [activeTab, setActiveTab] = useState<TabKey>("music");

  const buildUpdates = useCallback((
    music: MusicItem[],
    shows: ShowItem[],
    socials: SocialPost[],
  ) => {
    const toItems = <T,>(
      list: T[],
      mapper: (item: T) => UpdateItem,
      sortKey: (item: T) => string,
    ) =>
      [...list]
        .sort((a, b) => new Date(sortKey(b)).getTime() - new Date(sortKey(a)).getTime())
        .slice(0, 3)
        .map(mapper);

    setGroupedUpdates({
      music: toItems(music, (m: MusicItem) => ({
        id: m.id,
        source: "music",
        icon: Disc3,
        tag: "音乐",
        tagColor: "bg-sky-50 text-sky-600",
        title: m.title,
        desc: `${m.type} · ${m.album} · ${m.roles.join("/")}`,
        date: m.releaseDate,
        link: "/music",
      }), (m) => m.releaseDate),

      show: toItems(shows, (s: ShowItem) => ({
        id: s.id,
        source: "show",
        icon: Film,
        tag: "视频",
        tagColor: "bg-violet-50 text-violet-600",
        title: s.title,
        desc: `${s.platform} · ${s.members.slice(0, 3).join("、")}${s.members.length > 3 ? "等" : ""} · ${s.duration}`,
        date: s.date,
        link: "/shows",
      }), (s) => s.date),

      social: toItems(socials, (p: SocialPost) => ({
        id: p.id,
        source: "social",
        icon: MessageCircle,
        tag: "社交",
        tagColor: "bg-rose-50 text-rose-600",
        title: p.author || "新动态",
        desc: p.content.length > 40 ? p.content.slice(0, 40) + "..." : p.content,
        date: p.postDate.split("T")[0],
        link: "/social",
      }), (p) => p.postDate),
    });
  }, []);

  useEffect(() => {
    const music = loadMusicData();
    const shows = loadShowData();
    const socials = loadSocialData();
    buildUpdates(music, shows, socials);

    // Sync from Supabase
    Promise.all([
      syncMusicData(),
      syncShowData(),
      syncSocialData(),
    ]).then(([musicSynced, showsSynced, socialsSynced]) => {
      buildUpdates(musicSynced, showsSynced, socialsSynced);
    }).catch(() => {});
  }, [buildUpdates]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-50 via-white to-sky-50/50 border border-sky-100/50 p-10 md:p-16 mb-10"
      >
        {/* Background decorations */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-200/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-sky-300/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4" />

        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-100 text-sky-600 text-xs font-medium mb-4"
          >
            <Sparkles className="w-3.5 h-3.5" />
            BTOB · 任炫植 个人数据站
          </motion.div>

          <h1 className="text-5xl md:text-6xl font-black tracking-tight text-gray-900 mb-3">
            sik.log
          </h1>
          <p className="text-lg text-gray-500 mb-8">
            任炫植的专属档案室
          </p>

          <p className="text-gray-600 max-w-2xl leading-relaxed mb-8">
            Made by 任炫植.log
          </p>

          {!isAdmin && isAdminDomain && (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-sky-200 bg-white text-sky-600 text-sm font-medium hover:bg-sky-50 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              进入管理模式
            </button>
          )}
        </div>
      </motion.section>

      {/* Quick entries */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.6 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10"
      >
        <Link to="/music">
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-xl transition-shadow p-7 cursor-pointer"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-400 to-sky-600" />
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center">
                <Disc3 className="w-6 h-6 text-sky-500" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-sky-400 group-hover:translate-x-1 transition-all" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">音乐档案</h3>

          </motion.div>
        </Link>

        <Link to="/shows">
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-xl transition-shadow p-7 cursor-pointer"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-400 to-sky-500" />
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center">
                <Film className="w-6 h-6 text-violet-500" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-violet-400 group-hover:translate-x-1 transition-all" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">视频档案馆</h3>

          </motion.div>
        </Link>

        <Link to="/social">
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-xl transition-shadow p-7 cursor-pointer"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-400 to-sky-500" />
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-rose-500" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-rose-400 group-hover:translate-x-1 transition-all" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">社交动态</h3>

          </motion.div>
        </Link>
      </motion.section>

      {/* Latest updates */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-sky-500" />
            <h2 className="text-lg font-bold text-gray-900">最新动态</h2>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 mb-4">
          {TAB_CONFIG.map((tab) => {
            const active = activeTab === tab.key;
            const count = groupedUpdates[tab.key].length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 ${
                  active ? tab.activeColor : `${tab.color} hover:border-gray-300`
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                <span className={`text-xs ${active ? "opacity-70" : "opacity-50"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="space-y-3">
          {groupedUpdates[activeTab].length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              暂无{activeTab === "music" ? "音乐" : activeTab === "show" ? "视频" : "社交"}动态
            </p>
          ) : (
            <>
              {groupedUpdates[activeTab].map((item, i) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  onClick={() => navigate(item.link)}
                  className="flex items-start gap-4 p-4 rounded-xl bg-white border border-gray-100 hover:border-sky-200 transition-colors group cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 group-hover:bg-sky-50 transition-colors">
                    <item.icon className="w-5 h-5 text-gray-400 group-hover:text-sky-500 transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${item.tagColor}`}>
                        {item.tag}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar className="w-3 h-3" />
                        {item.date}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900 text-sm mb-0.5">{item.title}</h3>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                </motion.div>
              ))}

              {/* "查看全部" link */}
              <Link
                to={TAB_CONFIG.find((t) => t.key === activeTab)!.link}
                className="flex items-center justify-center gap-1 py-2 text-xs text-gray-400 hover:text-sky-500 transition-colors"
              >
                查看全部
                <ArrowRight className="w-3 h-3" />
              </Link>
            </>
          )}
        </div>
      </motion.section>

      {/* Data Manager (admin only) */}
      {isAdmin && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="mt-8"
        >
          <DataManager />
        </motion.section>
      )}
    </div>
  );
}
