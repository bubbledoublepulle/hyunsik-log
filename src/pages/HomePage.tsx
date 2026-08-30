import { useState, useEffect, useCallback, useMemo } from "react";
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
  Shuffle,
  Clock,
  Eye,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { loadMusicData, syncMusicData, type MusicItem } from "@/lib/musicData";
import {
  loadShowData,
  syncShowData,
  getPreferredThumbnail,
  getDisplayDuration,
  getDisplayViews,
  getDisplayDate,
  memberColors,
  type ShowItem,
} from "@/lib/showData";
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

function getProxiedThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&n=-1`;
}

function getPlatformStyleLocal(platform: string) {
  const styles: Record<string, { bg: string; text: string }> = {
    YouTube: { bg: "bg-red-500", text: "text-white" },
    Bilibili: { bg: "bg-pink-500", text: "text-white" },
    "V LIVE": { bg: "bg-indigo-500", text: "text-white" },
    Weverse: { bg: "bg-blue-500", text: "text-white" },
    "NAVER NOW": { bg: "bg-green-500", text: "text-white" },
    其他: { bg: "bg-gray-500", text: "text-white" },
  };
  return styles[platform] || styles["其他"];
}

export default function HomePage() {
  const { isAdmin, setAuthModalOpen } = useAuth();
  const isAdminDomain = typeof window !== "undefined" && window.location.hostname === "siklog.work" || window.location.hostname === "www.siklog.work";
  const navigate = useNavigate();

  const [musicData, setMusicData] = useState<MusicItem[]>([]);
  const [showData, setShowData] = useState<ShowItem[]>([]);
  const [socialData, setSocialData] = useState<SocialPost[]>([]);

  const [groupedUpdates, setGroupedUpdates] = useState<Record<TabKey, UpdateItem[]>>({
    music: [],
    show: [],
    social: [],
  });
  const [activeTab, setActiveTab] = useState<TabKey>("music");

  const [randomShow, setRandomShow] = useState<ShowItem | null>(null);

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
    setMusicData(music);
    setShowData(shows);
    setSocialData(socials);
    buildUpdates(music, shows, socials);

    Promise.all([
      syncMusicData(),
      syncShowData(),
      syncSocialData(),
    ]).then(([musicSynced, showsSynced, socialsSynced]) => {
      setMusicData(musicSynced);
      setShowData(showsSynced);
      setSocialData(socialsSynced);
      buildUpdates(musicSynced, showsSynced, socialsSynced);
    }).catch(() => {});
  }, [buildUpdates]);

  const pickRandomShow = useCallback(() => {
    if (showData.length > 0) {
      const idx = Math.floor(Math.random() * showData.length);
      setRandomShow(showData[idx]);
    }
  }, [showData]);

  useEffect(() => {
    if (showData.length > 0) {
      pickRandomShow();
    }
  }, [showData.length, pickRandomShow]);

  const today = new Date();
  const todayMonth = today.getMonth() + 1;
  const todayDate = today.getDate();
  const todayStr = `${todayMonth}月${todayDate}日`;

  const onThisDayItems = useMemo(() => {
    const items: { year: number; type: string; title: string; desc: string; color: string; link: string }[] = [];

    musicData.forEach((m) => {
      const d = new Date(m.releaseDate);
      if (d.getMonth() + 1 === todayMonth && d.getDate() === todayDate) {
        items.push({
          year: d.getFullYear(),
          type: "音乐",
          title: m.title,
          desc: `${m.album} · ${m.artist}`,
          color: "bg-sky-50 text-sky-600 border-sky-200",
          link: `/music#${m.id}`,
        });
      }
    });

    showData.forEach((s) => {
      const d = new Date(s.date);
      if (d.getMonth() + 1 === todayMonth && d.getDate() === todayDate) {
        items.push({
          year: d.getFullYear(),
          type: "视频",
          title: s.title,
          desc: `${s.platform} · ${s.members.slice(0, 3).join("、")}${s.members.length > 3 ? "等" : ""}`,
          color: "bg-violet-50 text-violet-600 border-violet-200",
          link: `/shows#${s.id}`,
        });
      }
    });

    socialData.forEach((p) => {
      const d = new Date(p.postDate);
      if (d.getMonth() + 1 === todayMonth && d.getDate() === todayDate) {
        items.push({
          year: d.getFullYear(),
          type: "社交",
          title: p.author || "新动态",
          desc: p.content.length > 30 ? p.content.slice(0, 30) + "..." : p.content,
          color: "bg-rose-50 text-rose-600 border-rose-200",
          link: `/social#${p.id}`,
        });
      }
    });

    items.sort((a, b) => b.year - a.year);
    return items;
  }, [musicData, showData, socialData, todayMonth, todayDate]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-3xl border border-sky-100/50 mb-10 min-h-[420px] md:min-h-[480px] flex items-end"
      >
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: "url('/IMG_1515%202.jpg')",
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-56"
          style={{
            background: "linear-gradient(to bottom, transparent 0%, #F8F9FA 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)",
          }}
        />

        <div className="relative z-10 w-full p-10 md:p-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-medium mb-4 border border-white/20"
          >
            <Sparkles className="w-3.5 h-3.5" />
            BTOB · 任炫植 个人数据站
          </motion.div>

          <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white mb-3 drop-shadow-lg">
            sik.log
          </h1>
          <p className="text-lg text-white/90 mb-8 drop-shadow-md">
            任炫植的专属档案室
          </p>

          <p className="text-white/80 max-w-2xl leading-relaxed mb-8 drop-shadow-sm">
            Made by 任炫植.log
          </p>

          {!isAdmin && isAdminDomain && (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/30 bg-white/15 backdrop-blur-md text-white text-sm font-medium hover:bg-white/25 transition-colors"
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

      {/* 那年今日 */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="mb-10"
      >
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-bold text-gray-900">那年今日</h2>
            </div>
            <span className="text-sm text-gray-400 font-medium">{todayStr}</span>
          </div>

          {onThisDayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                <Calendar className="w-7 h-7 text-gray-300" />
              </div>
              <p className="text-sm text-gray-400">今天没有历史动态</p>
            </div>
          ) : (
            <div className="space-y-2">
                            {onThisDayItems.map((item, i) => (
                <motion.div
                  key={`${item.year}-${item.type}-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => navigate(item.link)}
                  className="flex items-center gap-4 p-3 rounded-xl bg-gray-50/50 hover:bg-gray-50 transition-colors cursor-pointer group"
                >
                  <div className="w-16 text-center shrink-0">
                    <span className="text-xl font-bold text-gray-900">{item.year}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-md font-medium border ${item.color}`}>
                        {item.type}
                      </span>
                      <span className="font-medium text-gray-900 text-sm truncate">{item.title}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.section>

      {/* 随机推荐看视频 */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.6 }}
        className="mb-10"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-violet-500" />
            <h2 className="text-lg font-bold text-gray-900">随机推荐</h2>
          </div>
          <button
            onClick={pickRandomShow}
            disabled={showData.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 hover:text-violet-500 transition-colors disabled:opacity-40"
          >
            <Shuffle className="w-3.5 h-3.5" />
            换一换
          </button>
        </div>

        {randomShow ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <div
              className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-xl transition-shadow cursor-pointer"
              onClick={() => navigate("/shows")}
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                {(() => {
                  const thumbUrl = getPreferredThumbnail(randomShow);
                  return thumbUrl ? (
                    <img
                      src={getProxiedThumbnail(thumbUrl) || thumbUrl}
                      alt={randomShow.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.currentTarget as HTMLImageElement;
                        target.style.display = "none";
                        if (target.parentElement) {
                          target.parentElement.style.background = `linear-gradient(135deg, ${randomShow.thumbnailFrom}, ${randomShow.thumbnailTo})`;
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{
                        background: `linear-gradient(135deg, ${randomShow.thumbnailFrom}, ${randomShow.thumbnailTo})`,
                      }}
                    />
                  );
                })()}

                {/* hover 平台链接 */}
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4">
                  <span className="text-white/80 text-xs font-medium mb-1">选择平台观看</span>
                  {randomShow.links.map((link, linkIdx) => {
                    const style = getPlatformStyleLocal(link.platform);
                    return (
                      <a
                        key={linkIdx}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl ${style.bg} ${style.text} text-sm font-medium hover:scale-105 transition-transform shadow-lg`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        前往 {link.platform}
                      </a>
                    );
                  })}
                </div>

                {/* 平台标签 */}
                <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-black/30 backdrop-blur-sm text-white text-xs font-medium">
                  {randomShow.platform}
                </div>

                {randomShow.links.length > 1 && (
                  <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/40 backdrop-blur-sm text-white text-[10px] font-medium flex items-center gap-1">
                    <ExternalLink className="w-2.5 h-2.5" />
                    {randomShow.links.length} 个平台
                  </div>
                )}
              </div>

              <div className="p-4">
                <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 mb-2 min-h-[2.5rem]">
                  {randomShow.title}
                </h3>
                <div className="flex flex-wrap gap-1 mb-3">
                  {randomShow.members.map((member) => (
                    <span
                      key={member}
                      className={`text-xs px-1.5 py-0.5 rounded border font-medium ${memberColors[member]}`}
                    >
                      {member}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {getDisplayDate(randomShow)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {getDisplayDuration(randomShow)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {getDisplayViews(randomShow)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-3 mx-auto">
              <Film className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">暂无推荐视频</p>
          </div>
        )}
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
