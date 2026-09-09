import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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
  Image as ImageIcon,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
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

const TAB_CONFIG: { key: TabKey; label: string; icon: typeof Music; link: string }[] = [
  { key: "music", label: "音乐", icon: Disc3, link: "/music" },
  { key: "show", label: "视频", icon: Film, link: "/shows" },
  { key: "social", label: "社交", icon: MessageCircle, link: "/social" },
];

function getProxiedThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&n=-1`;
}

function getProxiedImageUrl(originalUrl: string): string {
  if (!originalUrl) return '';
  const foreignDomains = [
    'pbs.twimg.com', 'instagram.com', 'instagram.fs', 'fbcdn.net',
    'twimg.com', 'twitter.com', 'x.com', 'fbcdn.net',
  ];
  const isForeign = foreignDomains.some(domain =>
    originalUrl.toLowerCase().includes(domain)
  );
  if (isForeign) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(originalUrl)}&n=-1`;
  }
  return originalUrl;
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

function CardLogoDecoration() {
  return (
    <div className="absolute top-3 right-3 w-8 h-8 opacity-0 scale-50 -rotate-12 group-hover:opacity-100 group-hover:scale-100 group-hover:rotate-0 transition-all duration-300 pointer-events-none">
      <img
        src="/logo.svg"
        alt=""
        className="w-full h-full object-contain"
        style={{ filter: 'brightness(1.1) hue-rotate(10deg) saturate(1.2)' }}
      />
    </div>
  );
}

function MusicOnThisDayCard({ item, year, index }: { item: MusicItem; year: number; index: number }) {
  const no = String(index + 1).padStart(2, '0');
  return (
    <>
      <div className="relative aspect-[4/3] bg-steel-50/30 flex items-center justify-center overflow-hidden">
        {item.coverImageUrl ? (
          <img src={item.coverImageUrl} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="font-serif italic text-3xl sm:text-4xl text-steel-400/40">Music N°{no}</span>
        )}
        <CardLogoDecoration />
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600">Music</span>
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600">{year}</span>
        </div>
        <h3 className="font-bold text-steel-700 text-sm mb-1 line-clamp-1">{item.title}</h3>
        <p className="text-xs text-steel-500/70 mb-2">{item.album} · {item.artist}</p>
        <div className="flex flex-wrap gap-1">
          {item.roles.map((role) => (
            <span key={role} className="text-[10px] px-1.5 py-0.5 rounded-sm border border-steel-200/60 bg-steel-50/70 text-steel-600 font-medium">{role}</span>
          ))}
        </div>
        {item.isSelfComposed && (
          <div className="mt-2 flex items-center gap-1 text-[10px] text-steel-500">
            <Sparkles className="w-3 h-3" />自作曲
          </div>
        )}
      </div>
    </>
  );
}

function VideoOnThisDayCard({ item, year, index }: { item: ShowItem; year: number; index: number }) {
  const thumbUrl = getPreferredThumbnail(item);
  const no = String(index + 1).padStart(2, '0');
  return (
    <>
      <div className="relative aspect-[16/10] overflow-hidden bg-steel-50/30">
        {thumbUrl ? (
          <img
            src={getProxiedThumbnail(thumbUrl) || thumbUrl}
            alt={item.title}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{ background: `linear-gradient(135deg, ${item.thumbnailFrom}, ${item.thumbnailTo})` }}
          />
        )}
        {!thumbUrl && (
          <span className="absolute inset-0 flex items-center justify-center font-serif italic text-3xl sm:text-4xl text-steel-400/40">
            Video N°{no}
          </span>
        )}
        <CardLogoDecoration />
        <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-sm bg-black/30 backdrop-blur-sm text-white text-[10px] font-mono uppercase tracking-[0.15em]">
          {item.platform}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600">Video</span>
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600">{year}</span>
        </div>
        <h3 className="font-bold text-steel-700 text-sm mb-1 line-clamp-2 min-h-[2.5rem]">{item.title}</h3>
        <div className="flex flex-wrap gap-1 mt-2">
          {item.members.map((member) => (
            <span key={member} className={`text-[10px] px-1.5 py-0.5 rounded-sm border font-medium ${memberColors[member]}`}>
              {member}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

function SocialOnThisDayCard({ item, year, index }: { item: SocialPost; year: number; index: number }) {
  const hasImages = item.images.length > 0;
  const no = String(index + 1).padStart(2, '0');
  return (
    <>
      {hasImages ? (
        <div className="relative aspect-[16/10] overflow-hidden bg-steel-50/30">
          <img
            src={getProxiedImageUrl(item.images[0])}
            alt={item.author || "社交动态"}
            loading="lazy"
            className="w-full h-full object-cover"
          />
          <CardLogoDecoration />
          <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-sm bg-black/30 backdrop-blur-sm text-white text-[10px] font-mono uppercase tracking-[0.15em]">
            {item.platform}
          </div>
          {item.images.length > 1 && (
            <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-sm bg-black/40 backdrop-blur-sm text-white text-[10px] font-medium flex items-center gap-1">
              <ImageIcon className="w-2.5 h-2.5" />
              {item.images.length} 张
            </div>
          )}
        </div>
      ) : (
        <div className="relative aspect-[16/10] bg-steel-50/30 flex items-center justify-center overflow-hidden">
          <span className="font-serif italic text-3xl sm:text-4xl text-steel-400/40">Social N°{no}</span>
          <CardLogoDecoration />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600">Social</span>
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600">{year}</span>
        </div>
        <h3 className="font-bold text-steel-700 text-sm mb-1">{item.author || "新动态"}</h3>
        <p className="text-xs text-steel-500/70 line-clamp-3">{item.content.length > 60 ? item.content.slice(0, 60) + "..." : item.content}</p>
        {!hasImages && item.images.length > 0 && (
          <p className="text-[10px] text-steel-500/70 mt-2 flex items-center gap-1">
            <ImageIcon className="w-3 h-3" />{item.images.length} 张图片
          </p>
        )}
      </div>
    </>
  );
}

function MusicDetailModal({ item, onClose }: { item: MusicItem; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[85vh] bg-white/90 backdrop-blur-xl border border-steel-200/60 rounded-sm shadow-2xl overflow-hidden flex flex-col"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-steel-500/20 backdrop-blur-sm flex items-center justify-center text-steel-700 hover:bg-steel-500/30 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="h-1 bg-gradient-to-r from-steel-400 to-steel-600" />
        <div className="flex-1 overflow-y-auto p-6">
          {item.coverImageUrl && (
            <div className="relative aspect-[16/10] rounded-sm overflow-hidden bg-steel-50/30 border border-steel-200/60 mb-5">
              <img src={item.coverImageUrl} alt={item.title} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600 px-2 py-0.5 rounded-sm border border-steel-200/60 bg-steel-50/70">Music</span>
            <span className="text-xs text-steel-500/70">{item.releaseDate}</span>
          </div>

          <h2 className="text-xl font-bold text-steel-700 mb-2">{item.title}</h2>
          <p className="text-sm text-steel-500/70 mb-4">{item.album} · {item.artist}</p>

          <div className="flex flex-wrap gap-1.5 mb-4">
            <span className="text-xs px-2 py-1 rounded-sm bg-steel-50/70 text-steel-600 font-medium border border-steel-200/60">{item.type}</span>
            {item.roles.map((role) => (
              <span key={role} className="text-xs px-2 py-1 rounded-sm border border-steel-200/60 bg-steel-50/70 text-steel-600 font-medium">{role}</span>
            ))}
          </div>

          {item.isSelfComposed && (
            <div className="flex items-center gap-1.5 text-sm text-steel-500 mb-4">
              <Sparkles className="w-4 h-4" />
              <span>自作曲</span>
            </div>
          )}

          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-sm bg-steel-500 text-white text-sm font-medium hover:bg-steel-600 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              前往收听
            </a>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function VideoDetailModal({ item, onClose }: { item: ShowItem; onClose: () => void }) {
  const [showLinks, setShowLinks] = useState(false);
  const thumbUrl = getPreferredThumbnail(item);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[85vh] bg-white/90 backdrop-blur-xl border border-steel-200/60 rounded-sm shadow-2xl overflow-hidden flex flex-col"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-steel-500/20 backdrop-blur-sm flex items-center justify-center text-steel-700 hover:bg-steel-500/30 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative aspect-[16/10] overflow-hidden bg-steel-50/30">
          {thumbUrl ? (
            <img
              src={getProxiedThumbnail(thumbUrl) || thumbUrl}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: `linear-gradient(135deg, ${item.thumbnailFrom}, ${item.thumbnailTo})` }}
            />
          )}

          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity flex flex-col items-center justify-center gap-2 p-4 ${showLinks ? "opacity-100" : "opacity-0 md:opacity-0 md:group-hover:opacity-100"}`}
            onClick={() => setShowLinks(!showLinks)}
          >
            <span className="text-white/80 text-xs font-medium mb-1">选择平台观看</span>
            {item.links.map((link, linkIdx) => {
              const style = getPlatformStyleLocal(link.platform);
              return (
                <a
                  key={linkIdx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`flex items-center gap-2 px-4 py-2 rounded-sm ${style.bg} ${style.text} text-sm font-medium hover:scale-105 transition-transform shadow-lg`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  前往 {link.platform}
                </a>
              );
            })}
          </div>

          <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-sm bg-black/30 backdrop-blur-sm text-white text-[10px] font-mono uppercase tracking-[0.15em]">
            {item.platform}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="text-xl font-bold text-steel-700 mb-3">{item.title}</h2>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {item.members.map((member) => (
              <span key={member} className={`text-xs px-1.5 py-0.5 rounded-sm border font-medium ${memberColors[member]}`}>
                {member}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4 text-sm text-steel-500/70">
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{getDisplayDate(item)}</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{getDisplayDuration(item)}</span>
            <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{getDisplayViews(item)}</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SocialImageGrid({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  if (images.length === 1) {
    return (
      <div className="rounded-sm overflow-hidden bg-steel-50/40 border border-steel-200/60">
        <img src={getProxiedImageUrl(images[0])} alt="图片" loading="lazy" className="w-full h-auto max-h-[400px] object-contain" />
      </div>
    );
  }
  if (images.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-1 rounded-sm overflow-hidden">
        {images.map((img, i) => <img key={i} src={getProxiedImageUrl(img)} alt={`图片 ${i + 1}`} loading="lazy" className="w-full h-40 object-cover" />)}
      </div>
    );
  }
  if (images.length === 3) {
    return (
      <div className="grid grid-cols-2 gap-1 rounded-sm overflow-hidden">
        <img src={getProxiedImageUrl(images[0])} alt="图片 1" loading="lazy" className="w-full h-40 object-cover" />
        <img src={getProxiedImageUrl(images[1])} alt="图片 2" loading="lazy" className="w-full h-40 object-cover" />
        <img src={getProxiedImageUrl(images[2])} alt="图片 3" loading="lazy" className="w-full h-40 object-cover col-span-2" />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-1 rounded-sm overflow-hidden">
      {images.slice(0, 4).map((img, i) => (
        <div key={i} className="relative">
          <img src={getProxiedImageUrl(img)} alt={`图片 ${i + 1}`} loading="lazy" className="w-full h-36 object-cover" />
          {i === 3 && images.length > 4 && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><span className="text-white text-lg font-bold">+{images.length - 4}</span></div>}
        </div>
      ))}
    </div>
  );
}

function SocialDetailModal({ item, onClose }: { item: SocialPost; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[85vh] bg-white/90 backdrop-blur-xl border border-steel-200/60 rounded-sm shadow-2xl overflow-hidden flex flex-col"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-steel-500/20 backdrop-blur-sm flex items-center justify-center text-steel-700 hover:bg-steel-500/30 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="h-1 bg-gradient-to-r from-steel-400 to-steel-600" />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600 px-2 py-0.5 rounded-sm border border-steel-200/60 bg-steel-50/70">Social</span>
            <span className="text-xs text-steel-500/70">{item.postDate.split("T")[0]}</span>
          </div>

          <h2 className="text-lg font-bold text-steel-700 mb-1">{item.author || "新动态"}</h2>
          <p className="text-sm text-steel-500/70 mb-1">{item.platform} · {item.category}</p>

          <p className="text-sm text-steel-600/90 leading-relaxed whitespace-pre-wrap mb-4">{item.content}</p>

          {item.images.length > 0 && (
            <div className="mb-4">
              <SocialImageGrid images={item.images} />
            </div>
          )}

          {item.postUrl && (
            <a
              href={item.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-sm bg-steel-50/70 text-sm text-steel-600 hover:bg-steel-100 transition-colors font-medium border border-steel-200/60"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              查看原帖
            </a>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function HomePage() {
  const { isAdmin, setAuthModalOpen, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogoClick = () => {
    if (isAdmin) {
      logout();
      toast.success("已退出管理模式", { description: "已恢复访客身份" });
    } else {
      setAuthModalOpen(true);
    }
  };

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

  const [selectedMusic, setSelectedMusic] = useState<MusicItem | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<ShowItem | null>(null);
  const [selectedSocial, setSelectedSocial] = useState<SocialPost | null>(null);

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
        tagColor: "bg-steel-50/70 text-steel-600 border-steel-200/60",
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
        tagColor: "bg-steel-50/70 text-steel-600 border-steel-200/60",
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
        tagColor: "bg-steel-50/70 text-steel-600 border-steel-200/60",
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
    const items: (
      | { type: "音乐"; year: number; data: MusicItem }
      | { type: "视频"; year: number; data: ShowItem }
      | { type: "社交"; year: number; data: SocialPost }
    )[] = [];

    musicData.forEach((m) => {
      const d = new Date(m.releaseDate);
      if (d.getMonth() + 1 === todayMonth && d.getDate() === todayDate) {
        items.push({ type: "音乐", year: d.getFullYear(), data: m });
      }
    });

    showData.forEach((s) => {
      const d = new Date(s.date);
      if (d.getMonth() + 1 === todayMonth && d.getDate() === todayDate) {
        items.push({ type: "视频", year: d.getFullYear(), data: s });
      }
    });

    socialData.forEach((p) => {
      const d = new Date(p.postDate);
      if (d.getMonth() + 1 === todayMonth && d.getDate() === todayDate) {
        items.push({ type: "社交", year: d.getFullYear(), data: p });
      }
    });

    items.sort((a, b) => b.year - a.year);
    return items;
  }, [musicData, showData, socialData, todayMonth, todayDate]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="relative min-h-[70vh] md:min-h-screen flex flex-col items-center justify-start -mt-32 pt-32 pb-6 md:pb-24 mb-3 md:mb-10"
      >
        {/* Top-left portfolio label */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="absolute top-4 md:top-5 left-6 md:left-8 z-20 text-xs font-mono uppercase tracking-[0.2em] text-[#4682b4]/60"
        >
          Portfolio 2026
        </motion.div>

        {/* Top-right social links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="absolute top-4 md:top-5 right-6 md:right-8 z-[50] flex items-center gap-4 md:gap-6"
        >
          <a
            href="https://www.instagram.com/imhyunsik"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono uppercase tracking-[0.2em] text-[#4682b4] hover:text-blue-900 transition-colors"
          >
            IG
          </a>
          <a
            href="https://x.com/btob_imhyunsik"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono uppercase tracking-[0.2em] text-[#4682b4] hover:text-blue-900 transition-colors"
          >
            TW
          </a>
        </motion.div>

        <div className="relative z-10 w-full max-w-6xl mx-auto px-6 text-center pt-10 md:pt-36">
          <div className="relative inline-block group cursor-default">
            {/* Top-left decorative label */}
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 0.6 }}
              className="absolute -top-8 left-4 md:left-12 text-xs md:text-sm font-mono font-bold uppercase tracking-widest text-[#809bb2]"
            >
              LIM HYUNSIK
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="text-[18vw] md:text-[16vw] font-serif italic leading-none tracking-tighter flex items-end select-none drop-shadow-xl"
              style={{
                color: "#4682b4",
                textShadow: `
                  0 1px 0 rgba(52, 91, 121, 0.45),
                  0 3px 0 rgba(52, 91, 121, 0.30),
                  0 5px 0 rgba(52, 91, 121, 0.15),
                  0 8px 20px rgba(70, 130, 180, 0.35),
                  0 16px 40px rgba(70, 130, 180, 0.18)
                `,
              }}
            >
              <span className="inline-flex items-baseline">
                <span>sik.l</span>
                <span
                  className="relative inline-block z-10 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={handleLogoClick}
                  style={{
                    width: "0.9em",
                    height: "0.9em",
                    marginLeft: "-0.02em",
                    marginRight: "-0.02em",
                    verticalAlign: "baseline",
                    WebkitMaskImage: "url(/logo.svg)",
                    maskImage: "url(/logo.svg)",
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskPosition: "center bottom",
                    maskPosition: "center bottom",
                    backgroundColor: "#8daabf",
                  }}
                  title={isAdmin ? "点击退出管理模式" : "点击进入管理模式"}
                />
                <span>g</span>
              </span>
            </motion.h1>

            {/* Bottom-right decorative label */}
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.6 }}
              className="absolute -bottom-14 md:-bottom-20 right-4 md:right-12 text-xs md:text-sm font-mono font-bold uppercase tracking-widest text-[#809bb2]"
            >
              BTOB
            </motion.span>
          </div>
        </div>

        {/* Bottom info bar like reference */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="absolute bottom-2 md:bottom-8 left-0 right-0 p-3 md:p-8 flex justify-between items-end z-30 text-[10px] md:text-xs font-mono font-bold uppercase tracking-[0.15em] text-steel-500/60"
        >
          <div className="flex flex-col gap-1 md:gap-2">
            <span>Personal Archive</span>
          </div>

          <div className="flex flex-col items-center gap-1 animate-bounce-subtle">
            <span>↓ Scroll</span>
          </div>

          <div className="text-right flex flex-col gap-1 md:gap-2">
            <span>sik.log</span>
            <span>All rights reserved</span>
          </div>
        </motion.div>
      </motion.section>

      {/* 那年今日 */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="-mt-8 md:mt-0 mb-5 md:mb-10"
      >
        <div className="bg-white/40 rounded-sm border border-steel-200/60 shadow-sm p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-steel-500" />
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600 mb-0.5">On This Day</p>
                <h2 className="font-serif italic text-2xl text-steel-600">那年今日</h2>
              </div>
            </div>
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-steel-500/70">{todayStr}</span>
          </div>

          {onThisDayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 rounded-full bg-steel-50/70 border border-steel-200/60 flex items-center justify-center mb-3">
                <Calendar className="w-7 h-7 text-steel-400" />
              </div>
              <p className="text-sm text-steel-500/70">今天没有历史动态</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {onThisDayItems.map((item, i) => (
                <motion.div
                  key={`${item.year}-${item.type}-${i}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.05, 0.3) }}
                  onClick={() => {
                    if (item.type === "音乐") setSelectedMusic(item.data);
                    if (item.type === "视频") setSelectedVideo(item.data);
                    if (item.type === "社交") setSelectedSocial(item.data);
                  }}
                  className="group relative bg-white/40 rounded-sm border border-steel-200/60 shadow-sm overflow-hidden hover:-translate-y-2 hover:border-steel-300/80 transition-all cursor-pointer"
                >
                  {item.type === "音乐" && <MusicOnThisDayCard item={item.data} year={item.year} index={i} />}
                  {item.type === "视频" && <VideoOnThisDayCard item={item.data} year={item.year} index={i} />}
                  {item.type === "社交" && <SocialOnThisDayCard item={item.data} year={item.year} index={i} />}
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
        className="mb-5 md:mb-10"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Film className="w-5 h-5 text-steel-500" />
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600 mb-0.5">Random Pick</p>
              <h2 className="font-serif italic text-2xl text-steel-600">随机品熊</h2>
            </div>
          </div>
          <button
            onClick={pickRandomShow}
            disabled={showData.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-steel-200/60 text-[10px] font-mono uppercase tracking-[0.15em] text-steel-600 hover:bg-white/50 hover:border-steel-300/80 transition-all disabled:opacity-40"
          >
            <Shuffle className="w-3.5 h-3.5" />
            换一换
          </button>
        </div>

        {randomShow ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <div
              className="group relative bg-white/40 rounded-sm border border-steel-200/60 shadow-sm overflow-hidden hover:-translate-y-2 hover:border-steel-300/80 transition-all cursor-pointer"
              onClick={() => setSelectedVideo(randomShow)}
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-steel-50/30">
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
                          const fromColor = /^https?:\/\//.test(randomShow.thumbnailFrom) ? "#4682B4" : randomShow.thumbnailFrom;
                          target.parentElement.style.background = `linear-gradient(135deg, ${fromColor}, ${randomShow.thumbnailTo})`;
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

                <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-sm bg-black/30 backdrop-blur-sm text-white text-[10px] font-mono uppercase tracking-[0.15em]">
                  {randomShow.platform}
                </div>

                {randomShow.links.length > 1 && (
                  <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-sm bg-black/40 backdrop-blur-sm text-white text-[10px] font-medium flex items-center gap-1">
                    <ExternalLink className="w-2.5 h-2.5" />
                    {randomShow.links.length} 个平台
                  </div>
                )}
              </div>

              <div className="p-4">
                <h3 className="font-bold text-steel-700 text-sm leading-snug line-clamp-2 mb-2 min-h-[2.5rem]">
                  {randomShow.title}
                </h3>
                <div className="flex flex-wrap gap-1 mb-3">
                  {randomShow.members.map((member) => (
                    <span
                      key={member}
                      className={`text-xs px-1.5 py-0.5 rounded-sm border font-medium ${memberColors[member]}`}
                    >
                      {member}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-steel-500/70">
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
          <div className="bg-white/40 rounded-sm border border-steel-200/60 shadow-sm p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-steel-50/70 border border-steel-200/60 flex items-center justify-center mb-3 mx-auto">
              <Film className="w-7 h-7 text-steel-400" />
            </div>
            <p className="text-sm text-steel-500/70">暂无品熊视频</p>
          </div>
        )}
      </motion.section>

      {/* Latest updates */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-steel-500" />
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600 mb-0.5">Latest Updates</p>
              <h2 className="font-serif italic text-2xl text-steel-600">最新动态</h2>
            </div>
          </div>
        </div>

        <div className="flex gap-4 mb-3 border-b border-steel-200/40 pb-1">
          {TAB_CONFIG.map((tab) => {
            const active = activeTab === tab.key;
            const count = groupedUpdates[tab.key].length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 pb-2 text-[10px] font-mono uppercase tracking-[0.2em] transition-all ${
                  active
                    ? "text-steel-600 border-b border-steel-500 opacity-100"
                    : "text-steel-500/60 hover:text-steel-600 opacity-70"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                <span className={`text-[10px] ${active ? "opacity-100" : "opacity-60"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {groupedUpdates[activeTab].length === 0 ? (
            <p className="text-sm text-steel-500/70 py-6 text-center">
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
                  className="flex items-start gap-4 p-4 rounded-sm bg-white/40 border border-steel-200/60 shadow-sm hover:-translate-y-1 hover:border-steel-300/80 transition-all group cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-sm bg-steel-50/70 border border-steel-200/60 flex items-center justify-center shrink-0 group-hover:bg-white/70 transition-colors">
                    <item.icon className="w-5 h-5 text-steel-500 group-hover:text-steel-600 transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-0.5 rounded-sm border ${item.tagColor}`}>
                        {item.tag}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.15em] text-steel-500/60">
                        <Calendar className="w-3 h-3" />
                        {item.date}
                      </span>
                    </div>
                    <h3 className="font-medium text-steel-700 text-sm mb-0.5">{item.title}</h3>
                    <p className="text-xs text-steel-500/70">{item.desc}</p>
                  </div>
                </motion.div>
              ))}

              <Link
                to={TAB_CONFIG.find((t) => t.key === activeTab)!.link}
                className="flex items-center justify-center gap-1 py-2 text-xs font-mono uppercase tracking-[0.15em] text-steel-500/70 hover:text-steel-600 transition-colors"
              >
                查看全部
                <ArrowRight className="w-3 h-3" />
              </Link>
            </>
          )}
        </div>
      </motion.section>

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

      <AnimatePresence>
        {selectedMusic && (
          <MusicDetailModal item={selectedMusic} onClose={() => setSelectedMusic(null)} />
        )}
        {selectedVideo && (
          <VideoDetailModal item={selectedVideo} onClose={() => setSelectedVideo(null)} />
        )}
        {selectedSocial && (
          <SocialDetailModal item={selectedSocial} onClose={() => setSelectedSocial(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
