import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Clock,
  Eye,
  Calendar,
  RefreshCw,
  Tv,
  LayoutGrid,
  BarChart3,
  Users,
  Film,
  ExternalLink,
  ImageOff,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadShowData,
  saveShowData,
  syncShowData,
  fromDbRow,
  applyCachedMetadataToItems,
  memberColors,
  getPreferredThumbnail,
  getPreferredSource,
  getDisplayDuration,
  getDisplayViews,
  getDisplayDate,
  getCachedMetadata,
  isCacheStale,
  fetchShowMetadata,
  type ShowItem,
  type ShowMember,
} from "@/lib/showData";
import { useAuth } from "@/context/AuthContext";

function getProxiedThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&n=-1`;
}
import ShowFormModal from "@/components/ShowFormModal";
import BatchEditShowsModal from "@/components/BatchEditShowsModal";
import DeleteConfirmDialog from "@/components/DeleteConfirmDialog";
import ScrollToTop from "@/components/ScrollToTop";
import { useRealtimeData } from "@/hooks/useRealtimeData";

const allMembers: ShowMember[] = [
  "任炫植",
  "徐恩光",
  "李旼赫",
  "李昌燮",
  "Peniel",
  "陆星材",
  "全体",
];

type SortBy = "date-desc" | "date-asc" | "views-desc" | "title-asc";
type ViewMode = "archive" | "stats";

export default function ShowsPage() {
  const { isAdmin } = useAuth();
  const { data: rtShowData } = useRealtimeData("shows");

  const [showData, setShowData] = useState<ShowItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date-desc");
  const [selectedMembers, setSelectedMembers] = useState<Set<ShowMember>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("archive");

  const [metaRefreshing, setMetaRefreshing] = useState(false);
  const [metaVersion, setMetaVersion] = useState(0);
  const [lastSync, setLastSync] = useState<string>("");
  const refreshAbortRef = useRef(false);
  const AUTO_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [flashId, setFlashId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

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

  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-show-card]")) {
        setActiveCardId(null);
      }
    };
    document.addEventListener("click", handleDocClick);
    return () => document.removeEventListener("click", handleDocClick);
  }, []);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ShowItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ShowItem | null>(null);

  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  const [batchEditMode, setBatchEditMode] = useState(false);

  const initialLoadRef = useRef(true);
  const userModifiedRef = useRef(false);

  const prevRtShowCountRef = useRef(0);
  const rtShowNotifiedRef = useRef(false);
  useEffect(() => {
    if (!rtShowData || rtShowData.length === 0) return;
    if (!userModifiedRef.current) {
      const items = rtShowData.map((row: any) => fromDbRow(row));
      setShowData(items);
      try {
        localStorage.setItem("hsik_shows_data", JSON.stringify(items));
      } catch {
        // ignore
      }
      if (!isAdmin && rtShowNotifiedRef.current && rtShowData.length !== prevRtShowCountRef.current) {
        toast.info("数据已更新", { description: "管理员发布了最新档案数据" });
      }
      prevRtShowCountRef.current = rtShowData.length;
      rtShowNotifiedRef.current = true;
    }
  }, [rtShowData, isAdmin]);

  useEffect(() => {
    const data = loadShowData();
    setShowData(data);
    syncShowData().then((synced) => {
      if (!userModifiedRef.current) {
        setShowData(synced);
      }
    }).catch(() => {});
    const stored = localStorage.getItem("hsik_show_metadata_cache");
    if (stored) {
      try {
        const cache = JSON.parse(stored);
        const timestamps = Object.values(cache).map((m: any) => m.fetchedAt || 0);
        if (timestamps.length > 0) {
          const latest = Math.max(...timestamps);
          setLastSync(new Date(latest).toLocaleString("zh-CN"));
        }
      } catch {
        // ignore
      }
    }
    autoRefreshTimerRef.current = setInterval(() => {
      if (!metaRefreshing && showData.length > 0) {
        refreshMetadata();
      }
    }, AUTO_REFRESH_INTERVAL);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !metaRefreshing && showData.length > 0) {
        const hasStale = showData.some((item) => {
          const meta = getCachedMetadata(item.id);
          return isCacheStale(meta);
        });
        if (hasStale) {
          refreshMetadata();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showData.length > 0) {
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        return;
      }
      userModifiedRef.current = true;
      saveShowData(showData).then(({ error }) => {
        if (error) {
          toast.error("云端同步失败", { description: error });
        }
      }).catch(() => {});
    }
  }, [showData]);

  

  const refreshMetadata = useCallback(async () => {
    if (refreshAbortRef.current) return;
    refreshAbortRef.current = true;
    setMetaRefreshing(true);
    toast.info("正在抓取视频元数据...", { description: "封面、时长、播放量更新中" });
        try {
      for (const item of showData) {
        await fetchShowMetadata(item, true);
      }
      setMetaVersion((v) => v + 1);
      const updated = applyCachedMetadataToItems(showData);
      initialLoadRef.current = true;
      setShowData(updated);
      const now = new Date().toLocaleString("zh-CN");
      setLastSync(now);
      localStorage.setItem("hsik_meta_last_sync", now);
      toast.success("元数据更新完成", {
        description: "封面、时长、播放量已同步至最新",
      });
    } catch {
      toast.error("部分元数据抓取失败", {
        description: "网络异常或平台限制，已使用缓存数据",
      });
    } finally {
      setMetaRefreshing(false);
      refreshAbortRef.current = false;
      const now = new Date().toLocaleString("zh-CN");
      setLastSync(now);
      localStorage.setItem("hsik_meta_last_sync", now);
    }
  }, [showData]);

  const filteredData = useMemo(() => {
    let result = [...showData];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.platform.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
      );
    }
    if (selectedMembers.size > 0) {
      result = result.filter((item) =>
        item.members.some((m) => selectedMembers.has(m))
      );
    }
    switch (sortBy) {
      case "date-desc":
        result.sort((a, b) => new Date(getDisplayDate(b)).getTime() - new Date(getDisplayDate(a)).getTime());
        break;
      case "date-asc":
        result.sort((a, b) => new Date(getDisplayDate(a)).getTime() - new Date(getDisplayDate(b)).getTime());
        break;
      case "views-desc":
        result.sort((a, b) => parseViews(getDisplayViews(b)) - parseViews(getDisplayViews(a)));
        break;
      case "title-asc":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showData, searchQuery, selectedMembers, sortBy, metaVersion]);

  const toggleMember = (member: ShowMember) => {
    const next = new Set(selectedMembers);
    if (next.has(member)) {
      next.delete(member);
    } else {
      next.add(member);
    }
    setSelectedMembers(next);
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormOpen(true);
  };

  const handleEdit = (item: ShowItem) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  const handleSave = (item: ShowItem) => {
    if (editingItem) {
      setShowData((prev) => prev.map((s) => (s.id === item.id ? item : s)));
      toast.success("修改已保存", { description: item.title });
    } else {
      setShowData((prev) => [...prev, item]);
      toast.success("综艺已添加", { description: item.title });
    }
    setFormOpen(false);
    setEditingItem(null);
  };

  const handleSaveBatch = (items: ShowItem[]) => {
    userModifiedRef.current = true;
    const newData = [...showData, ...items];
    setShowData(newData);
    saveShowData(newData);
    toast.success(`已批量添加 ${items.length} 条综艺`, { description: "数据正在同步到云端..." });
    setFormOpen(false);
    setEditingItem(null);
  };

  const handleDelete = (item: ShowItem) => {
    userModifiedRef.current = true;
    const newData = showData.filter((s) => s.id !== item.id);
    setShowData(newData);
    saveShowData(newData);
    toast.success("已删除", { description: item.title });
  };

  const toggleBatchSelect = (id: string) => {
    const next = new Set(batchSelectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setBatchSelectedIds(next);
  };

  const handleBatchEditSave = (updatedItems: ShowItem[]) => {
    setShowData((prev) => prev.map((item) => {
      const updated = updatedItems.find((u) => u.id === item.id);
      return updated || item;
    }));
    toast.success(`已批量更新 ${updatedItems.length} 条档案`);
    setBatchEditOpen(false);
    setBatchSelectedIds(new Set());
    setBatchEditMode(false);
  };

  const stats = useMemo(() => {
    const total = showData.length;
    const totalViews = showData.reduce((sum, s) => sum + parseViews(getDisplayViews(s)), 0);
    const platformCount = new Set(showData.map((s) => s.platform)).size;
    const memberStats: Record<string, number> = {};
    allMembers.forEach((m) => (memberStats[m] = 0));
    showData.forEach((s) => {
      s.members.forEach((m) => {
        memberStats[m] = (memberStats[m] || 0) + 1;
      });
    });
    return { total, totalViews, platformCount, memberStats };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showData, metaVersion]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm font-bold">
            BTOB · 任炫植
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">视频档案馆</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setViewMode("archive")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === "archive" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              档案
            </button>
            <button
              onClick={() => setViewMode("stats")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === "stats" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              统计
            </button>
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-xs font-medium">
            {metaRefreshing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {lastSync ? `同步于 ${lastSync}` : "尚未同步"}
          </div>

          {isAdmin && (
            <button
              onClick={refreshMetadata}
              disabled={metaRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 text-xs font-medium hover:border-sky-300 hover:text-sky-600 transition-all disabled:opacity-50"
              title="手动刷新视频元数据"
            >
              {metaRefreshing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              刷新数据
            </button>
          )}
        </div>
      </div>

      {viewMode === "stats" ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatBox icon={Film} label="档案总数" value={stats.total} color="text-sky-500" bg="bg-sky-50" />
            <StatBox icon={Eye} label="总播放量" value={formatLargeNumber(stats.totalViews)} color="text-rose-500" bg="bg-rose-50" />
            <StatBox icon={Tv} label="平台数" value={stats.platformCount} color="text-violet-500" bg="bg-violet-50" />
            <StatBox icon={Users} label="出演成员" value={Object.keys(stats.memberStats).filter((k) => stats.memberStats[k] > 0).length} color="text-emerald-500" bg="bg-emerald-50" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <Users className="w-5 h-5 text-sky-500" />
              <h3 className="font-bold text-gray-900">成员出演次数</h3>
            </div>
            <div className="space-y-3">
              {allMembers.map((member) => {
                const count = stats.memberStats[member] || 0;
                const maxCount = Math.max(...Object.values(stats.memberStats), 1);
                const width = (count / maxCount) * 100;
                return (
                  <div key={member} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-600 w-16 shrink-0">{member}</span>
                    <div className="flex-1 h-7 bg-gray-50 rounded-lg overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${width}%` }} transition={{ duration: 0.6, ease: "easeOut" }} className="h-full bg-gradient-to-r from-sky-300 to-sky-500 rounded-lg flex items-center justify-end pr-2">
                        <span className="text-xs font-bold text-white">{count}</span>
                      </motion.div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <Tv className="w-5 h-5 text-violet-500" />
              <h3 className="font-bold text-gray-900">平台分布</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(
                showData.reduce((acc, s) => {
                  acc[s.platform] = (acc[s.platform] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              ).map(([platform, count]) => (
                <div key={platform} className="p-4 rounded-xl bg-gray-50 border border-gray-100 text-center">
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className="text-xs text-gray-500 mt-1">{platform}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索综艺标题、平台或描述..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:bg-white transition-all"
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all cursor-pointer"
              >
                <option value="date-desc">最新播出</option>
                <option value="date-asc">最早播出</option>
                <option value="views-desc">播放量最高</option>
                <option value="title-asc">名称排序</option>
              </select>

              {isAdmin && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={handleAdd}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-400 text-white text-sm font-medium hover:bg-sky-500 transition-colors shadow-md shadow-sky-200 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    添加综艺
                  </button>
                  <button
                    onClick={() => {
                      if (batchEditMode) {
                        if (batchSelectedIds.size > 0) {
                          setBatchEditOpen(true);
                        } else {
                          setBatchEditMode(false);
                        }
                      } else {
                        setBatchEditMode(true);
                        toast.info("批量编辑模式", { description: "点击卡片选择要编辑的视频" });
                      }
                    }}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-md whitespace-nowrap ${batchEditMode ? "bg-amber-400 text-white hover:bg-amber-500 shadow-amber-200" : "bg-violet-400 text-white hover:bg-violet-500 shadow-violet-200"}`}
                  >
                    {batchEditMode ? `批量编辑 (${batchSelectedIds.size})` : "批量编辑"}
                  </button>
                  {batchEditMode && (
                    <>
                      <button
                        onClick={() => setBatchSelectedIds(new Set(filteredData.map((item) => item.id)))}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-sky-200 text-sky-600 text-sm font-medium hover:bg-sky-50 transition-colors whitespace-nowrap"
                      >
                        全选当前结果
                      </button>
                      <button
                        onClick={() => { setBatchEditMode(false); setBatchSelectedIds(new Set()); }}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors whitespace-nowrap"
                      >
                        取消
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-50">
              <span className="text-xs text-gray-400 self-center mr-1">点击标签筛选：</span>
              {allMembers.map((member) => (
                <button
                  key={member}
                  onClick={() => toggleMember(member)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedMembers.has(member) ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}
                >
                  {member}
                </button>
              ))}
              {selectedMembers.size > 0 && (
                <button
                  onClick={() => setSelectedMembers(new Set())}
                  className="px-3 py-1.5 rounded-full text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  清除筛选
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredData.map((item, index) => {
                const thumbUrl = getPreferredThumbnail(item);
                const dataSource = getPreferredSource(item);
                const displayDuration = getDisplayDuration(item);
                const displayViews = getDisplayViews(item);
                const displayDate = getDisplayDate(item);
                const cachedMeta = getCachedMetadata(item.id);
                const isStale = isCacheStale(cachedMeta);
                const isSelected = batchSelectedIds.has(item.id);
                return (
                                    <motion.div
                    key={item.id}
                    id={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.3 }}
                    className={`group relative bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-xl transition-shadow ${batchEditMode ? "cursor-pointer" : ""} ${isSelected ? "ring-2 ring-sky-400 ring-offset-2" : ""} ${flashId === item.id ? "flash-highlight" : ""}`}
                                        onClick={() => {
                      if (batchEditMode) {
                        toggleBatchSelect(item.id);
                      } else {
                        setActiveCardId(item.id);
                      }
                    }}
                    data-show-card
                  >
                    <div
                      className="relative aspect-[16/10] overflow-hidden"
                      style={thumbUrl ? undefined : { background: `linear-gradient(135deg, ${item.thumbnailFrom}, ${item.thumbnailTo})` }}
                    >
                      {thumbUrl ? (
                        <img
                          src={getProxiedThumbnail(thumbUrl) || thumbUrl}
                          alt={item.title}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.currentTarget;
                            target.style.display = "none";
                            if (target.parentElement) {
                              target.parentElement.style.background = `linear-gradient(135deg, ${item.thumbnailFrom}, ${item.thumbnailTo})`;
                            }
                          }}
                        />
                      ) : null}

                      {batchEditMode && (
                        <div className="absolute top-3 left-3 z-20">
                          <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? "bg-sky-400 border-sky-400" : "bg-white/80 border-gray-300"}`}>
                            {isSelected && <Check className="w-4 h-4 text-white" />}
                          </div>
                        </div>
                      )}

                                           {item.links.length > 0 && !batchEditMode && (
                        <div className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity flex flex-col items-center justify-center gap-2 p-4 ${activeCardId === item.id ? "opacity-100" : "opacity-0"}`}>
                          <span className="text-white/80 text-xs font-medium mb-1">选择平台观看</span>
                          {item.links.map((link, linkIdx) => {
                            const style = getPlatformStyleLocal(link.platform);
                            return (
                              <a
                                key={linkIdx}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl ${style.bg} ${style.text} text-sm font-medium hover:scale-105 transition-transform shadow-lg`}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                前往 {link.platform}
                              </a>
                            );
                          })}
                        </div>
                      )}

                      {dataSource && (
                        <div className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-black/40 backdrop-blur-sm text-white text-[10px] font-medium flex items-center gap-1" style={batchEditMode ? { left: "2.5rem" } : undefined}>
                          <ImageOff className="w-2.5 h-2.5" />
                          来源: {dataSource}
                          {isStale && cachedMeta && <span className="text-amber-300 ml-1">·待更新</span>}
                        </div>
                      )}

                      {isAdmin && !batchEditMode && (
                        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="w-7 h-7 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center text-gray-600 hover:bg-white hover:text-sky-500 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }} className="w-7 h-7 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center text-gray-600 hover:bg-white hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-black/30 backdrop-blur-sm text-white text-xs font-medium">
                        {item.platform}
                      </div>

                      {item.links.length > 1 && (
                        <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/40 backdrop-blur-sm text-white text-[10px] font-medium flex items-center gap-1">
                          <ExternalLink className="w-2.5 h-2.5" />
                          {item.links.length} 个平台
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 mb-2 min-h-[2.5rem]">
                        {item.title}
                      </h3>

                      <div className="flex flex-wrap gap-1 mb-3">
                        {item.members.map((member) => (
                          <span key={member} className={`text-xs px-1.5 py-0.5 rounded border font-medium ${memberColors[member]}`}>
                            {member}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{displayDate}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{displayDuration}</span>
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{displayViews}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
          </div>

          {filteredData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                <Tv className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-sm text-gray-500 mb-1">没有找到匹配的综艺档案</p>
              <p className="text-xs text-gray-400">尝试调整筛选条件或清除筛选</p>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-4">共 {filteredData.length} 条档案{filteredData.length !== showData.length && ` (总计 ${showData.length} 条)`}</p>
        </motion.div>
      )}

      <ShowFormModal open={formOpen} onClose={() => { setFormOpen(false); setEditingItem(null); }} onSave={handleSave} onSaveBatch={handleSaveBatch} editingItem={editingItem} />
      <BatchEditShowsModal open={batchEditOpen} onClose={() => setBatchEditOpen(false)} items={showData.filter((item) => batchSelectedIds.has(item.id))} onSave={handleBatchEditSave} />
      <DeleteConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && handleDelete(deleteTarget)} title="删除综艺" message={`确定要删除「${deleteTarget?.title}」吗？此操作不可撤销。`} />
      <ScrollToTop />
    </div>
  );
}

function StatBox({ icon: Icon, label, value, color, bg }: { icon: React.ElementType; label: string; value: string | number; color: string; bg: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <p className="text-2xl font-bold text-gray-900 mb-0.5">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
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

function parseViews(views: string): number {
  const str = views.replace(/[,，\s]/g, "");
  if (str.includes("亿")) return parseFloat(str) * 100000000;
  if (str.includes("万")) return parseFloat(str) * 10000;
  return parseInt(str) || 0;
}

function formatLargeNumber(n: number): string {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString();
}
