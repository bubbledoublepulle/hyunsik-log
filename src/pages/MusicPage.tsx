import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Sparkles,
  ListMusic,
  ArrowUpDown,
  RotateCcw,
  LayoutGrid,
  Album,
  Music,
  Calendar,
  Link2,
  List,
  Crown,
  Disc3,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadMusicData,
  saveMusicData,
  syncMusicData,
  resetMusicData,
  fromDbRow,
  allTypes,
  allRoles,
  type MusicItem,
  type MusicType,
  type MusicRole,
} from "@/lib/musicData";
import { useAuth } from "@/context/AuthContext";
import FilterSidebar from "@/components/FilterSidebar";
import MusicFormModal from "@/components/MusicFormModal";
import BatchImportModal from "@/components/BatchImportModal";
import DeleteConfirmDialog from "@/components/DeleteConfirmDialog";
import ScrollToTop from "@/components/ScrollToTop";
import { StatCard } from "@/components/StatCard";
import { useRealtimeData } from "@/hooks/useRealtimeData";

type SortBy = "date-desc" | "date-asc" | "title-asc";
type ViewMode = "cards" | "table";

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

export default function MusicPage() {
  const { isAdmin } = useAuth();
  const { data: rtMusicData } = useRealtimeData("music");

  const [musicData, setMusicData] = useState<MusicItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date-desc");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  const [selectedTypes, setSelectedTypes] = useState<Set<MusicType>>(new Set());
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [selectedRoles, setSelectedRoles] = useState<Set<MusicRole>>(new Set());
  const [onlySelfComposed, setOnlySelfComposed] = useState(false);

  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const t1 = setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setFlashId(hash);
        }
      }, 500);
      const t2 = setTimeout(() => setFlashId(null), 1500);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, []);

  const [formOpen, setFormOpen] = useState(false);
  const [batchImportOpen, setBatchImportOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MusicItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MusicItem | null>(null);

  const initialLoadRef = useRef(true);
  const userModifiedRef = useRef(false);

  const prevRtMusicCountRef = useRef(0);
  const rtMusicNotifiedRef = useRef(false);
  useEffect(() => {
    if (!rtMusicData || rtMusicData.length === 0) return;
    if (!userModifiedRef.current) {
      const items = rtMusicData.map((row: any) => fromDbRow(row));
      setMusicData(items);
      try {
        localStorage.setItem("hsik_music_data", JSON.stringify(items));
      } catch {}
      if (!isAdmin && rtMusicNotifiedRef.current && rtMusicData.length !== prevRtMusicCountRef.current) {
        toast.info("数据已更新", { description: "管理员发布了最新音乐数据" });
      }
      prevRtMusicCountRef.current = rtMusicData.length;
      rtMusicNotifiedRef.current = true;
    }
  }, [rtMusicData, isAdmin]);

  useEffect(() => {
    setMusicData(loadMusicData());
    syncMusicData().then((data) => {
      if (!userModifiedRef.current) setMusicData(data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (musicData.length > 0) {
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        return;
      }
      userModifiedRef.current = true;
      saveMusicData(musicData).then(({ error }) => {
        if (error) toast.error("云端同步失败", { description: error });
      }).catch(() => {});
    }
  }, [musicData]);

  const years = useMemo(() => {
    const yearSet = new Set<number>();
    musicData.forEach((item) => {
      const year = new Date(item.releaseDate).getFullYear();
      if (!isNaN(year)) yearSet.add(year);
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [musicData]);

  const filteredData = useMemo(() => {
    let result = [...musicData];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((item) =>
        item.title.toLowerCase().includes(q) ||
        item.album.toLowerCase().includes(q) ||
        item.artist.toLowerCase().includes(q)
      );
    }
    if (selectedTypes.size > 0) {
      result = result.filter((item) => selectedTypes.has(item.type));
    }
    if (selectedYears.size > 0) {
      result = result.filter((item) => {
        const year = new Date(item.releaseDate).getFullYear();
        return selectedYears.has(year);
      });
    }
    if (selectedRoles.size > 0) {
      result = result.filter((item) => {
        const roles = Array.isArray(item.roles) ? item.roles : [];
        return roles.some((r) => selectedRoles.has(r));
      });
    }
    if (onlySelfComposed) {
      result = result.filter((item) => item.isSelfComposed);
    }
    switch (sortBy) {
      case "date-desc":
        result.sort((a, b) => {
          const dateDiff = new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
          if (dateDiff !== 0) return dateDiff;
          return (a.albumNo ?? 1) - (b.albumNo ?? 1);
        });
        break;
      case "date-asc":
        result.sort((a, b) => {
          const dateDiff = new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime();
          if (dateDiff !== 0) return dateDiff;
          return (a.albumNo ?? 1) - (b.albumNo ?? 1);
        });
        break;
      case "title-asc":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }
    return result;
  }, [musicData, searchQuery, selectedTypes, selectedYears, selectedRoles, onlySelfComposed, sortBy]);

  const stats = useMemo(() => {
    const total = musicData.length;
    const selfComposed = musicData.filter((m) => m.isSelfComposed).length;
    const titleTracks = musicData.filter((m) => m.isTitleTrack).length;
    return { total, selfComposed, titleTracks };
  }, [musicData]);

  const albumGroups = useMemo(() => {
    const groups = new Map<string, MusicItem[]>();
    filteredData.forEach((item) => {
      const key = item.album || "未知专辑";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
    return Array.from(groups.entries())
      .map(([album, songs]) => {
        const sortedSongs = [...songs];
        if (sortBy === "title-asc") {
          sortedSongs.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
        } else {
          sortedSongs.sort((a, b) => {
            const dateDiff = new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime();
            if (dateDiff !== 0) return dateDiff;
            return (a.albumNo ?? 1) - (b.albumNo ?? 1);
          });
        }
        return { album, songs: sortedSongs };
      })
      .filter((group) => group.songs.length > 0)
      .sort((a, b) => {
        switch (sortBy) {
          case "title-asc":
            return a.album.localeCompare(b.album, "zh-CN");
          case "date-asc": {
            const aTimes = a.songs.map((s) => new Date(s.releaseDate).getTime()).filter((t) => !Number.isNaN(t));
            const bTimes = b.songs.map((s) => new Date(s.releaseDate).getTime()).filter((t) => !Number.isNaN(t));
            const aEarliest = aTimes.length > 0 ? Math.min(...aTimes) : 0;
            const bEarliest = bTimes.length > 0 ? Math.min(...bTimes) : 0;
            return aEarliest - bEarliest;
          }
          case "date-desc":
          default: {
            const aTimes = a.songs.map((s) => new Date(s.releaseDate).getTime()).filter((t) => !Number.isNaN(t));
            const bTimes = b.songs.map((s) => new Date(s.releaseDate).getTime()).filter((t) => !Number.isNaN(t));
            const aLatest = aTimes.length > 0 ? Math.max(...aTimes) : 0;
            const bLatest = bTimes.length > 0 ? Math.max(...bTimes) : 0;
            return bLatest - aLatest;
          }
        }
      });
  }, [filteredData, sortBy]);

  const toggleType = (type: MusicType) => {
    const next = new Set(selectedTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setSelectedTypes(next);
  };

  const toggleYear = (year: number) => {
    const next = new Set(selectedYears);
    if (next.has(year)) next.delete(year);
    else next.add(year);
    setSelectedYears(next);
  };

  const toggleRole = (role: MusicRole) => {
    const next = new Set(selectedRoles);
    if (next.has(role)) next.delete(role);
    else next.add(role);
    setSelectedRoles(next);
  };

  const clearAllFilters = () => {
    setSelectedTypes(new Set());
    setSelectedYears(new Set());
    setSelectedRoles(new Set());
    setOnlySelfComposed(false);
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormOpen(true);
  };

  const handleEdit = (item: MusicItem) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  const handleSave = (item: MusicItem) => {
    if (editingItem) {
      setMusicData((prev) => prev.map((m) => (m.id === item.id ? item : m)));
      toast.success("修改已保存", { description: item.title });
    } else {
      setMusicData((prev) => [...prev, item]);
      toast.success("歌曲已添加", { description: item.title });
    }
    setFormOpen(false);
    setEditingItem(null);
  };

  const handleBatchSave = (items: MusicItem[]) => {
    setMusicData((prev) => [...prev, ...items]);
    toast.success(`已批量添加 ${items.length} 首歌曲`, { description: "数据正在同步到云端..." });
    setBatchImportOpen(false);
  };

  const handleDelete = async (item: MusicItem) => {
    userModifiedRef.current = true;
    const newData = musicData.filter((m) => m.id !== item.id);
    setMusicData(newData);
    const { error } = await saveMusicData(newData);
    if (error) {
      toast.error("删除同步失败", { description: error });
    } else {
      toast.success("已删除", { description: item.title });
    }
  };

  const handleReset = async () => {
    setMusicData(await resetMusicData());
    clearAllFilters();
    toast.success("数据已重置", { description: "恢复到初始 12 条音乐档案" });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600 mb-1">
            Music Archive
          </p>
          <h1 className="text-3xl font-serif italic text-steel-600">音乐档案</h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <>
              <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-2 rounded-sm border border-steel-200/60 text-steel-600 text-sm font-medium hover:bg-white/50 transition-colors">
                <RotateCcw className="w-4 h-4" />重置数据
              </button>
              <button onClick={handleAdd} className="flex items-center gap-1.5 px-4 py-2 rounded-sm bg-steel-500 text-white text-sm font-medium hover:bg-steel-600 transition-colors shadow-sm shadow-steel-500/20">
                <Plus className="w-4 h-4" />添加歌曲
              </button>
              <button onClick={() => setBatchImportOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-sm bg-steel-600 text-white text-sm font-medium hover:bg-steel-700 transition-colors shadow-sm shadow-steel-600/20">
                <Link2 className="w-4 h-4" />批量导入
              </button>
            </>
          )}
          <div className="flex p-1 bg-white/40 border border-steel-200/60 rounded-sm">
            <button onClick={() => setViewMode("cards")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-medium transition-all ${viewMode === "cards" ? "bg-white text-steel-600 shadow-sm" : "text-steel-500/70 hover:text-steel-600"}`}>
              <LayoutGrid className="w-3.5 h-3.5" />卡片
            </button>
            <button onClick={() => setViewMode("table")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-medium transition-all ${viewMode === "table" ? "bg-white text-steel-600 shadow-sm" : "text-steel-500/70 hover:text-steel-600"}`}>
              <List className="w-3.5 h-3.5" />表格
            </button>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="作品总数" value={stats.total} icon={ListMusic} color="text-steel-500" bg="bg-steel-50/70" delay={0} />
        <StatCard label="自作曲" value={stats.selfComposed} icon={Sparkles} color="text-steel-500" bg="bg-steel-50/70" delay={0.05} />
        <StatCard label="主打曲" value={stats.titleTracks} icon={Crown} color="text-steel-500" bg="bg-steel-50/70" delay={0.08} />
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <FilterSidebar
          types={allTypes}
          selectedTypes={selectedTypes}
          onToggleType={toggleType}
          years={years}
          selectedYears={selectedYears}
          onToggleYear={toggleYear}
          roles={allRoles}
          selectedRoles={selectedRoles}
          onToggleRole={toggleRole}
          onlySelfComposed={onlySelfComposed}
          onToggleSelfComposed={() => setOnlySelfComposed(!onlySelfComposed)}
          onClearAll={clearAllFilters}
        />

        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-steel-400" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索歌曲、歌手或专辑..." className="w-full pl-10 pr-4 py-2.5 rounded-sm border border-steel-200/60 bg-white/40 text-sm text-steel-700 outline-none focus:border-steel-500 focus:ring-2 focus:ring-steel-200/30 placeholder:text-steel-400/60 transition-all" />
            </div>
            <div className="relative">
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-steel-400 pointer-events-none" />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="pl-9 pr-8 py-2.5 rounded-sm border border-steel-200/60 bg-white/40 text-sm text-steel-700 outline-none focus:border-steel-500 focus:ring-2 focus:ring-steel-200/30 transition-all cursor-pointer appearance-none">
                <option value="date-desc">最新发行</option>
                <option value="date-asc">最早发行</option>
                <option value="title-asc">名称排序</option>
              </select>
            </div>
          </div>

          {viewMode === "table" ? (
            <div className="bg-white/40 rounded-sm border border-steel-200/60 shadow-sm overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full">
                  <thead>
                    <tr className="bg-steel-50/40 border-b border-steel-200/60">
                      <th className="text-left text-[10px] font-mono uppercase tracking-[0.15em] opacity-60 text-steel-600 px-4 py-3">歌曲</th>
                      <th className="text-left text-[10px] font-mono uppercase tracking-[0.15em] opacity-60 text-steel-600 px-4 py-3 hidden md:table-cell">歌手</th>
                      <th className="text-left text-[10px] font-mono uppercase tracking-[0.15em] opacity-60 text-steel-600 px-4 py-3 hidden md:table-cell">专辑</th>
                      <th className="text-left text-[10px] font-mono uppercase tracking-[0.15em] opacity-60 text-steel-600 px-4 py-3 hidden lg:table-cell">类型</th>
                      <th className="text-left text-[10px] font-mono uppercase tracking-[0.15em] opacity-60 text-steel-600 px-4 py-3">角色</th>
                      <th className="text-right text-[10px] font-mono uppercase tracking-[0.15em] opacity-60 text-steel-600 px-4 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {filteredData.map((item, index) => (
                        <motion.tr key={item.id} id={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                          className={`group relative border-b border-steel-100/60 last:border-0 hover:bg-steel-50/30 transition-colors ${index % 2 === 1 ? "bg-white/30" : ""} ${item.isSelfComposed ? "shadow-[inset_3px_0_0_0_#4682B4]" : ""} ${flashId === item.id ? "flash-highlight" : ""}`}>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-steel-700 text-sm">{item.title}</span>
                                  {item.isTitleTrack && <span title="主打曲"><Crown className="w-3.5 h-3.5 text-amber-400" /></span>}
                                  {item.isSelfComposed && <Sparkles className="w-3.5 h-3.5 text-steel-400" />}
                                </div>
                                <span className="text-xs text-steel-500/60">{item.releaseDate}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 hidden md:table-cell max-w-[100px]">
                            <span className="text-sm text-steel-600 block truncate whitespace-nowrap" title={item.artist || "—"}>
                              {item.artist || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 hidden md:table-cell">
                            <span className="text-sm text-steel-600">{item.album}</span>
                          </td>
                          <td className="px-4 py-3.5 hidden lg:table-cell">
                            <span className="text-xs px-2 py-1 rounded-sm bg-steel-50/70 text-steel-600 font-medium whitespace-nowrap border border-steel-200/60">{item.type}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap gap-1">
                              {item.roles.map((role) => (
                                <span key={role} className="text-xs px-1.5 py-0.5 rounded-sm border border-steel-200/60 bg-steel-50/70 text-steel-600 font-medium">{role}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-end gap-1">
                              {item.link && item.link !== "https://music.apple.com" && (
                                <a href={item.link} target="_blank" rel="noopener noreferrer" className="w-7 h-7 rounded-sm flex items-center justify-center text-steel-400 hover:bg-steel-50/70 hover:text-steel-600 transition-colors">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                              {isAdmin && (
                                <>
                                  <button onClick={() => handleEdit(item)} className="w-7 h-7 rounded-sm flex items-center justify-center text-steel-400 hover:bg-steel-50/70 hover:text-steel-600 transition-colors">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setDeleteTarget(item)} className="w-7 h-7 rounded-sm flex items-center justify-center text-steel-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
              {filteredData.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-steel-50/70 border border-steel-200/60 flex items-center justify-center mb-3">
                    <ListMusic className="w-8 h-8 text-steel-400" />
                  </div>
                  <p className="text-sm text-steel-500/70 mb-1">没有找到匹配的作品</p>
                  <p className="text-xs text-steel-500/50">尝试调整筛选条件或清除所有筛选</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              <AnimatePresence mode="popLayout">
                {albumGroups.map((group, gi) => {
                  const albumSongCount = group.songs.length;
                  const albumSelfCount = group.songs.filter((s) => s.isSelfComposed).length;
                  const albumTitleCount = group.songs.filter((s) => s.isTitleTrack).length;
                  const albumDate = group.songs.map((s) => s.releaseDate).sort()[0] || "";
                  const albumYear = albumDate ? new Date(albumDate).getFullYear() : "";
                  const albumCover = group.songs.find((s) => s.coverImageUrl)?.coverImageUrl;
                  return (
                    <motion.div key={group.album} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: gi * 0.08 }}>
                      <div className="flex items-center justify-between mb-4 px-1">
                        <div className="flex items-center gap-3">
                          {albumCover ? (
                            <img src={albumCover} alt={group.album} className="w-12 h-12 rounded-sm object-cover border border-steel-200/60 bg-steel-50/30" />
                          ) : (
                            <div className="w-9 h-9 rounded-sm bg-steel-100 flex items-center justify-center">
                              <Album className="w-4 h-4 text-steel-500" />
                            </div>
                          )}
                          <div>
                            <h3 className="font-bold text-steel-700 text-base">{group.album}</h3>
                            <div className="flex items-center gap-3 text-xs text-steel-500/70 mt-0.5">
                              <span className="flex items-center gap-1"><Music className="w-3 h-3" />{albumSongCount} 首歌</span>
                              {albumSelfCount > 0 && <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-steel-400" />{albumSelfCount} 首自作曲</span>}
                              {albumTitleCount > 0 && <span className="flex items-center gap-1"><Crown className="w-3 h-3 text-amber-400" />{albumTitleCount} 首主打</span>}
                              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{albumDate}{albumYear ? ` · ${albumYear}` : ""}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        <AnimatePresence mode="popLayout">
                          {group.songs.map((item, idx) => {
                            const year = new Date(item.releaseDate).getFullYear();
                            return (
                              <motion.div
                                key={item.id}
                                id={item.id}
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ delay: Math.min(idx * 0.05, 0.3) }}
                                className={`group relative bg-white/40 rounded-sm border border-steel-200/60 shadow-sm overflow-hidden hover:-translate-y-2 hover:border-steel-300/80 transition-all ${flashId === item.id ? "flash-highlight" : ""}`}
                              >
                                <div className="relative aspect-[4/3] bg-steel-50/30 flex items-center justify-center overflow-hidden">
                                  {item.coverImageUrl ? (
                                    <img src={item.coverImageUrl} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
                                  ) : (
                                    <span className="font-serif italic text-3xl sm:text-4xl text-steel-400/40">No.{String(item.albumNo ?? 1).padStart(2, "0")}</span>
                                  )}
                                  <CardLogoDecoration />
                                  {item.isTitleTrack && (
                                    <div className="absolute top-3 left-3 px-1.5 py-0.5 rounded-sm bg-amber-100/90 border border-amber-200/60 text-amber-700 text-[10px] font-mono uppercase tracking-wider flex items-center gap-1 z-10" title="主打曲">
                                      <Crown className="w-3 h-3" />TITLE
                                    </div>
                                  )}
                                  {isAdmin && (
                                    <div className="absolute bottom-3 left-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                      <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="w-7 h-7 rounded-sm bg-white/90 backdrop-blur-sm flex items-center justify-center text-steel-600 hover:bg-white hover:text-steel-800 transition-colors border border-steel-200/60">
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }} className="w-7 h-7 rounded-sm bg-white/90 backdrop-blur-sm flex items-center justify-center text-steel-600 hover:bg-white hover:text-red-500 transition-colors border border-steel-200/60">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div className="p-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600">Music</span>
                                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600">{isNaN(year) ? item.releaseDate : year}</span>
                                  </div>
                                  <h3 className="font-bold text-lg text-steel-600 mb-1 line-clamp-1 flex items-center gap-1.5">
                                    {item.title}
                                    {item.isTitleTrack && <span title="主打曲"><Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" /></span>}
                                  </h3>
                                  <p className="text-xs text-steel-500/70 mb-3">{item.album} · {item.artist}</p>
                                  <div className="flex flex-wrap gap-1 mb-3">
                                    {item.roles.map((role) => (
                                      <span key={role} className="text-[10px] px-1.5 py-0.5 rounded-sm border border-steel-200/60 bg-steel-50/70 text-steel-600 font-medium">{role}</span>
                                    ))}
                                  </div>
                                  <div className="flex items-center justify-between">
                                    {item.isSelfComposed && (
                                      <span className="text-[10px] text-steel-500 flex items-center gap-1">
                                        <Sparkles className="w-3 h-3" />自作曲
                                      </span>
                                    )}
                                    {item.link && item.link !== "https://music.apple.com" && (
                                      <a href={item.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ml-auto text-[10px] font-mono uppercase tracking-[0.15em] text-steel-500 hover:text-steel-600 flex items-center gap-1 transition-colors">
                                        → View
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {albumGroups.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center bg-white/40 rounded-sm border border-steel-200/60 shadow-sm">
                  <div className="w-16 h-16 rounded-full bg-steel-50/70 border border-steel-200/60 flex items-center justify-center mb-3">
                    <Disc3 className="w-8 h-8 text-steel-400" />
                  </div>
                  <p className="text-sm text-steel-500/70 mb-1">没有找到匹配的作品</p>
                  <p className="text-xs text-steel-500/50">尝试调整筛选条件或清除所有筛选</p>
                </div>
              )}
            </div>
          )}
          <p className="text-xs font-mono uppercase tracking-[0.15em] text-steel-500/60 mt-3">共 {filteredData.length} 条结果{filteredData.length !== musicData.length && ` (总计 ${musicData.length} 条)`}</p>
        </div>
      </div>

      <MusicFormModal open={formOpen} onClose={() => { setFormOpen(false); setEditingItem(null); }} onSave={handleSave} editingItem={editingItem} />
      <BatchImportModal open={batchImportOpen} onClose={() => setBatchImportOpen(false)} onSave={handleBatchSave} />
      <DeleteConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && handleDelete(deleteTarget)} title="删除歌曲" message={`确定要删除「${deleteTarget?.title}」吗？此操作不可撤销。`} />
      <ScrollToTop />
    </div>
  );
}
