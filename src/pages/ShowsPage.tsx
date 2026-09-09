import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadShowData,
  saveShowData,
  syncShowData,
  fromDbRow,
  memberColors,
  getPreferredThumbnail,
  getPreferredSource,
  getDisplayDuration,
  getDisplayViews,
  getDisplayDate,
  getCachedMetadata,
  isCacheStale,
  type ShowItem,
  type ShowMember,
} from "@/lib/showData";
import { useAuth } from "@/context/AuthContext";

function getProxiedThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&n=-1`;
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

function LazyCard({ children, id, className }: { children: React.ReactNode; id: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!isVisible) {
    return <div ref={ref} id={id} className={`min-h-[300px] bg-steel-50/40 rounded-sm border border-steel-200/60 ${className || ""}`} />;
  }

  return <div ref={ref} id={id} className={className}>{children}</div>;
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
  "BTOB",
  "BCOM组",
];

type SortBy = "date-desc" | "date-asc" | "views-desc" | "title-asc";
type ViewMode = "archive" | "stats";

const BATCH_SIZE = 30;

export default function ShowsPage() {
  const { isAdmin } = useAuth();
  const { data: rtShowData } = useRealtimeData("shows");

  const [showData, setShowData] = useState<ShowItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date-desc");
  const [selectedMembers, setSelectedMembers] = useState<Set<ShowMember>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("archive");

  const [metaRefreshing, setMetaRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<string>("");
  const refreshAbortRef = useRef(false);
  const AUTO_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [flashId, setFlashId] = useState<string | null>(null);

  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<{ year: number; month: number } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [displayCount, setDisplayCount] = useState(BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDisplayCount(BATCH_SIZE);
  }, [debouncedSearchQuery, selectedMembers, sortBy]);

  const filteredData = useMemo(() => {
    let result = [...showData];
    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.toLowerCase();
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
  }, [showData, debouncedSearchQuery, selectedMembers, sortBy]);

  const visibleData = useMemo(() => {
    return filteredData.slice(0, displayCount);
  }, [filteredData, displayCount]);

  const hasMore = displayCount < filteredData.length;

  useEffect(() => {
    if (!hasMore) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setDisplayCount((prev) => prev + BATCH_SIZE);
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);

  const scrollTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!scrollTargetRef.current) return;
    const itemId = scrollTargetRef.current;
    scrollTargetRef.current = null;

    const tryScroll = () => {
      const el = document.getElementById(itemId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setFlashId(itemId);
        setTimeout(() => setFlashId(null), 1500);
        return true;
      }
      return false;
    };

    if (tryScroll()) return;

    requestAnimationFrame(() => {
      if (!tryScroll()) {
        requestAnimationFrame(() => {
          tryScroll();
        });
      }
    });
  }, [displayCount, filteredData]);

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

    let totalUpdated = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let offset = 0;
    const limit = 50;

    try {
      try {
        localStorage.removeItem("hsik_show_metadata_cache");
        localStorage.removeItem("hsik_video_fetch_cache");
      } catch {}

      while (true) {
        const resp = await fetch(`/api/refresh-all-shows?offset=${offset}&limit=${limit}`, {
          method: "POST",
          signal: AbortSignal.timeout(30000),
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const data = await resp.json();

        totalUpdated += data.updated || 0;
        totalFailed += data.failed || 0;
        totalSkipped += data.skipped || 0;

        if (!data.hasMore) {
          break;
        }

        offset = data.nextOffset;
      }

      await new Promise(r => setTimeout(r, 2000));

      const synced = await syncShowData();
      setShowData(synced);

      const now = new Date().toLocaleString("zh-CN");
      setLastSync(now);
      localStorage.setItem("hsik_meta_last_sync", now);

      toast.success("播放量更新完成", {
        description: `已更新 ${totalUpdated} 条，失败 ${totalFailed} 条，跳过 ${totalSkipped} 条`,
      });
    } catch (e) {
      toast.error("播放量刷新失败", {
        description: String(e),
      });
    } finally {
      setMetaRefreshing(false);
      refreshAbortRef.current = false;
      const now = new Date().toLocaleString("zh-CN");
      setLastSync(now);
      localStorage.setItem("hsik_meta_last_sync", now);
    }
  }, [showData]);

  const handleToggleYear = (year: number) => {
    if (expandedYear === year) {
      setExpandedYear(null);
      setExpandedMonth(null);
    } else {
      setExpandedYear(year);
      setExpandedMonth(null);
    }
  };

  const handleToggleMonth = (year: number, month: number) => {
    if (expandedMonth?.year === year && expandedMonth?.month === month) {
      setExpandedMonth(null);
    } else {
      setExpandedMonth({ year, month });
    }
  };

  const handleScrollToDate = useCallback((itemId: string) => {
    const index = filteredData.findIndex((item) => item.id === itemId);
    if (index === -1) return;

    if (index >= displayCount) {
      scrollTargetRef.current = itemId;
      setDisplayCount(index + 1);
      return;
    }

    const el = document.getElementById(itemId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashId(itemId);
      setTimeout(() => setFlashId(null), 1500);
    }
  }, [filteredData, displayCount]);

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

  const handleSave = async (item: ShowItem) => {
    userModifiedRef.current = true;
    let newData: ShowItem[];

    if (editingItem) {
      newData = showData.map((s) => (s.id === item.id ? item : s));
      setShowData(newData);
      toast.success("修改已保存", { description: item.title });
    } else {
      newData = [...showData, item];
      setShowData(newData);
      toast.success("视频已添加", { description: item.title });
    }

    const { error } = await saveShowData(newData);
    if (error) {
      toast.error("云端同步失败", { description: error });
    }

    setFormOpen(false);
    setEditingItem(null);
  };

  const handleSaveBatch = (items: ShowItem[]) => {
    userModifiedRef.current = true;
    const newData = [...showData, ...items];
    setShowData(newData);
    saveShowData(newData);
    toast.success(`已批量添加 ${items.length} 条视频`, { description: "数据正在同步到云端..." });
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

  const timelineData = useMemo(() => {
    const grouped: Record<number, Record<number, Record<number, { count: number; firstItemId: string }>>> = {};

    showData.forEach((item) => {
      const date = new Date(getDisplayDate(item));
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();

      if (!grouped[year]) grouped[year] = {};
      if (!grouped[year][month]) grouped[year][month] = {};
      if (!grouped[year][month][day]) {
        grouped[year][month][day] = { count: 0, firstItemId: item.id };
      }
      grouped[year][month][day].count++;
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => parseInt(b) - parseInt(a))
      .map(([year, months]) => ({
        year: parseInt(year),
        months: Object.entries(months)
          .sort(([a], [b]) => parseInt(b) - parseInt(a))
          .map(([month, days]) => ({
            month: parseInt(month),
            days: Object.entries(days)
              .sort(([a], [b]) => parseInt(a) - parseInt(b))
              .map(([day, data]) => ({
                day: parseInt(day),
                count: data.count,
                firstItemId: data.firstItemId,
              })),
          })),
      }));
  }, [showData]);

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
  }, [showData]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600 mb-1">
            Video Archive
          </p>
          <h1 className="text-3xl font-serif italic text-steel-600">视频档案</h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex p-1 bg-white/40 border border-steel-200/60 rounded-sm">
            <button
              onClick={() => setViewMode("archive")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-medium transition-all ${viewMode === "archive" ? "bg-white text-steel-600 shadow-sm" : "text-steel-500/70 hover:text-steel-600"}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              档案
            </button>
            <button
              onClick={() => setViewMode("stats")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-medium transition-all ${viewMode === "stats" ? "bg-white text-steel-600 shadow-sm" : "text-steel-500/70 hover:text-steel-600"}`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              统计
            </button>
          </div>

          {isAdmin && (
            <button
              onClick={refreshMetadata}
              disabled={metaRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-steel-200/60 bg-white/40 text-steel-600 text-xs font-medium hover:bg-white/60 hover:border-steel-300/80 transition-all disabled:opacity-50"
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
          <div className="grid grid-cols-2 gap-4">
            <StatBox icon={Film} label="档案总数" value={stats.total} color="text-steel-500" bg="bg-steel-50/70" />
            <StatBox icon={Eye} label="总播放量" value={formatLargeNumber(stats.totalViews)} color="text-steel-500" bg="bg-steel-50/70" />
          </div>

          <div className="bg-white/40 rounded-sm border border-steel-200/60 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <Users className="w-5 h-5 text-steel-500" />
              <h3 className="font-bold text-steel-700">成员出演次数</h3>
            </div>
            <div className="space-y-3">
              {allMembers.map((member) => {
                const count = stats.memberStats[member] || 0;
                const maxCount = Math.max(...Object.values(stats.memberStats), 1);
                const width = (count / maxCount) * 100;
                return (
                  <div key={member} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-steel-600 w-16 shrink-0">{member}</span>
                    <div className="flex-1 h-7 bg-steel-50/70 rounded-sm overflow-hidden border border-steel-200/40">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${width}%` }} transition={{ duration: 0.6, ease: "easeOut" }} className="h-full bg-gradient-to-r from-steel-300 to-steel-500 rounded-sm flex items-center justify-end pr-2">
                        <span className="text-xs font-bold text-white">{count}</span>
                      </motion.div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="bg-white/40 rounded-sm border border-steel-200/60 shadow-sm p-5 mb-6">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-steel-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索综艺标题、平台或描述..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-sm border border-steel-200/60 bg-white/40 text-sm text-steel-700 outline-none focus:border-steel-500 focus:ring-2 focus:ring-steel-200/30 placeholder:text-steel-400/60 transition-all"
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="px-4 py-2.5 rounded-sm border border-steel-200/60 bg-white/40 text-sm text-steel-700 outline-none focus:border-steel-500 focus:ring-2 focus:ring-steel-200/30 transition-all cursor-pointer"
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
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-sm bg-steel-500 text-white text-sm font-medium hover:bg-steel-600 transition-colors shadow-sm shadow-steel-500/20 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    添加视频
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
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-sm text-sm font-medium transition-colors shadow-sm whitespace-nowrap ${batchEditMode ? "bg-steel-600 text-white hover:bg-steel-700 shadow-steel-600/20" : "bg-white/50 text-steel-600 hover:bg-white/70 border border-steel-200/60"}`}
                  >
                    {batchEditMode ? `批量编辑 (${batchSelectedIds.size})` : "批量编辑"}
                  </button>
                  {batchEditMode && (
                    <>
                      <button
                        onClick={() => setBatchSelectedIds(new Set(filteredData.map((item) => item.id)))}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-sm border border-steel-200/60 text-steel-600 text-sm font-medium hover:bg-white/50 transition-colors whitespace-nowrap"
                      >
                        全选当前结果
                      </button>
                      <button
                        onClick={() => { setBatchEditMode(false); setBatchSelectedIds(new Set()); }}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-sm border border-steel-200/60 text-steel-500 text-sm font-medium hover:bg-white/50 transition-colors whitespace-nowrap"
                      >
                        取消
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-steel-200/40">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600 self-center mr-1">成员：</span>
              {allMembers.map((member) => (
                <button
                  key={member}
                  onClick={() => toggleMember(member)}
                  className={`px-3 py-1.5 rounded-sm text-xs font-medium border transition-all ${selectedMembers.has(member) ? "bg-steel-600 text-white border-steel-600" : "bg-white/40 text-steel-600 border-steel-200/60 hover:border-steel-400"}`}
                >
                  {member}
                </button>
              ))}
              {selectedMembers.size > 0 && (
                <button
                  onClick={() => setSelectedMembers(new Set())}
                  className="px-3 py-1.5 rounded-sm text-xs text-steel-500/70 hover:text-red-500 transition-colors"
                >
                  清除筛选
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            <motion.aside
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full lg:w-56 shrink-0"
            >
              <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto bg-white/40 rounded-sm border border-steel-200/60 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-4 h-4 text-steel-500 shrink-0" />
                  <h3 className="font-bold text-steel-700 text-sm">时间轴</h3>
                </div>

                <div className="space-y-1">
                  {timelineData.map((node) => (
                    <div key={node.year}>
                      <button
                        onClick={() => handleToggleYear(node.year)}
                        className="w-full flex items-center gap-1.5 px-2 py-2 rounded-sm text-sm font-semibold transition-all text-steel-600 hover:bg-white/50"
                      >
                        {expandedYear === node.year ? (
                          <ChevronDown className="w-3.5 h-3.5 text-steel-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-steel-400 shrink-0" />
                        )}
                        <span className={`w-2 h-2 rounded-full shrink-0 ${expandedYear === node.year ? "bg-steel-500" : "bg-steel-200"}`} />
                        <span className="whitespace-nowrap">{node.year}年</span>
                        <span className="ml-auto text-xs text-steel-500/60 font-normal whitespace-nowrap">
                          {node.months.reduce((sum: number, m: any) => sum + m.days.reduce((s: number, d: any) => s + d.count, 0), 0)}
                        </span>
                      </button>

                      <AnimatePresence initial={false}>
                        {expandedYear === node.year && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="ml-2 mt-1 space-y-0.5 border-l-2 border-steel-200/40 pl-2">
                              {node.months.map((m) => (
                                <div key={m.month}>
                                  <button
                                    onClick={() => handleToggleMonth(node.year, m.month)}
                                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-sm text-xs transition-all text-steel-500/80 hover:bg-white/50"
                                  >
                                    {expandedMonth?.year === node.year && expandedMonth?.month === m.month ? (
                                      <ChevronDown className="w-3 h-3 text-steel-400 shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-3 h-3 text-steel-400 shrink-0" />
                                    )}
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${expandedMonth?.year === node.year && expandedMonth?.month === m.month ? "bg-steel-500" : "bg-steel-200"}`} />
                                    <span className="whitespace-nowrap">{m.month}月</span>
                                    <span className="ml-auto text-[10px] text-steel-500/60 whitespace-nowrap">
                                      {m.days.reduce((s: number, d: any) => s + d.count, 0)}
                                    </span>
                                  </button>

                                  <AnimatePresence initial={false}>
                                    {expandedMonth?.year === node.year && expandedMonth?.month === m.month && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2, ease: "easeInOut" }}
                                        className="overflow-hidden"
                                      >
                                        <div className="ml-3 mt-0.5 space-y-0.5 border-l-2 border-steel-100/60 pl-2">
                                          {m.days.map((d: any) => (
                                            <button
                                              key={d.day}
                                              onClick={() => handleScrollToDate(d.firstItemId)}
                                              className="w-full flex items-center gap-1.5 px-2 py-1 rounded-sm text-[11px] transition-all text-steel-500/70 hover:bg-white/50 hover:text-steel-600"
                                            >
                                              <span className="w-1 h-1 rounded-full bg-steel-200 shrink-0" />
                                              <span className="whitespace-nowrap">{d.day}日</span>
                                              <span className="ml-auto text-[10px] text-steel-500/60 whitespace-nowrap">
                                                ({d.count}条)
                                              </span>
                                            </button>
                                          ))}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            </motion.aside>

            <div className="flex-1 min-w-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {visibleData.map((item, index) => {
                  const thumbUrl = getPreferredThumbnail(item);
                  const dataSource = getPreferredSource(item);
                  const displayDuration = getDisplayDuration(item);
                  const displayViews = getDisplayViews(item);
                  const displayDate = getDisplayDate(item);
                  const cachedMeta = getCachedMetadata(item.id);
                  const isStale = isCacheStale(cachedMeta);
                  const isSelected = batchSelectedIds.has(item.id);
                  const no = String(index + 1).padStart(2, '0');
                  return (
                    <LazyCard key={item.id} id={item.id} className="h-full">
                      <div
                        className={`group relative h-full bg-white/40 rounded-sm border border-steel-200/60 shadow-sm overflow-hidden hover:-translate-y-2 hover:border-steel-300/80 transition-all ${batchEditMode ? "cursor-pointer" : ""} ${isSelected ? "ring-2 ring-steel-500 ring-offset-2" : ""} ${flashId === item.id ? "flash-highlight" : ""}`}
                        onClick={() => {
                          if (batchEditMode) {
                            toggleBatchSelect(item.id);
                          }
                        }}
                        data-show-card
                      >
                        <div
                          className="relative aspect-[16/10] overflow-hidden bg-steel-50/30"
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
                          ) : (
                            <span className="absolute inset-0 flex items-center justify-center font-serif italic text-3xl sm:text-4xl text-steel-400/40">
                              Show N°{no}
                            </span>
                          )}

                          <CardLogoDecoration />

                          {batchEditMode && (
                            <div className="absolute top-3 left-3 z-20">
                              <div className={`w-6 h-6 rounded-sm border-2 flex items-center justify-center transition-all ${isSelected ? "bg-steel-500 border-steel-500" : "bg-white/80 border-steel-300"}`}>
                                {isSelected && <Check className="w-4 h-4 text-white" />}
                              </div>
                            </div>
                          )}

                          {item.links.length > 0 && !batchEditMode && (
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4">
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
                          )}

                          {dataSource && (
                            <div className="absolute top-3 left-3 px-2 py-0.5 rounded-sm bg-black/40 backdrop-blur-sm text-white text-[10px] font-medium flex items-center gap-1" style={batchEditMode ? { left: "2.5rem" } : undefined}>
                              <ImageOff className="w-2.5 h-2.5" />
                              来源: {dataSource}
                              {isStale && cachedMeta && <span className="text-amber-300 ml-1">·待更新</span>}
                            </div>
                          )}

                          {isAdmin && !batchEditMode && (
                            <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                              <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="w-7 h-7 rounded-sm bg-white/90 backdrop-blur-sm flex items-center justify-center text-steel-600 hover:bg-white hover:text-steel-800 transition-colors border border-steel-200/60">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }} className="w-7 h-7 rounded-sm bg-white/90 backdrop-blur-sm flex items-center justify-center text-steel-600 hover:bg-white hover:text-red-500 transition-colors border border-steel-200/60">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-sm bg-black/30 backdrop-blur-sm text-white text-[10px] font-mono uppercase tracking-[0.15em]">
                            {item.platform}
                          </div>

                          {item.links.length > 1 && (
                            <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-sm bg-black/40 backdrop-blur-sm text-white text-[10px] font-medium flex items-center gap-1">
                              <ExternalLink className="w-2.5 h-2.5" />
                              {item.links.length} 个平台
                            </div>
                          )}
                        </div>

                        <div className="p-4">
                          <h3
                            className="font-bold text-sm text-steel-600 leading-snug line-clamp-2 mb-2 min-h-[2.25rem]"
                            title={item.title}
                          >
                            {item.title}
                          </h3>

                          <div className="flex flex-wrap gap-1 mb-3">
                            {item.members.map((member) => (
                              <span key={member} className={`text-xs px-1.5 py-0.5 rounded-sm border font-medium ${memberColors[member]}`}>
                                {member}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-steel-500/70 flex-wrap">
                            <span className="flex items-center gap-1 whitespace-nowrap"><Calendar className="w-3 h-3 shrink-0" />{displayDate}</span>
                            <span className="flex items-center gap-1 whitespace-nowrap"><Clock className="w-3 h-3 shrink-0" />{displayDuration}</span>
                            <span className="flex items-center gap-1 whitespace-nowrap"><Eye className="w-3 h-3 shrink-0" />{displayViews}</span>
                          </div>
                        </div>
                      </div>
                    </LazyCard>
                  );
                })}
              </div>

              {filteredData.length > 0 && (
                <div className="mt-6 text-center">
                  {hasMore ? (
                    <>
                      <div ref={loadMoreRef} className="h-4" />
                      <p className="text-xs font-mono uppercase tracking-[0.15em] text-steel-500/60">
                        已显示 {visibleData.length} / {filteredData.length} 条 · 向下滚动加载更多
                      </p>
                    </>
                  ) : (
                    <p className="text-xs font-mono uppercase tracking-[0.15em] text-steel-500/60">
                      已显示全部 {filteredData.length} 条档案
                    </p>
                  )}
                </div>
              )}

              {filteredData.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-steel-50/70 border border-steel-200/60 flex items-center justify-center mb-3">
                    <Tv className="w-8 h-8 text-steel-400" />
                  </div>
                  <p className="text-sm text-steel-500/70 mb-1">没有找到匹配的综艺档案</p>
                  <p className="text-xs text-steel-500/50">尝试调整筛选条件或清除筛选</p>
                </div>
              )}
            </div>
          </div>
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
    <div className="bg-white/40 rounded-sm border border-steel-200/60 shadow-sm p-5">
      <div className={`w-10 h-10 rounded-sm ${bg} flex items-center justify-center mb-3`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <p className="text-2xl font-bold text-steel-600 mb-0.5">{value}</p>
      <p className="text-xs font-mono uppercase tracking-[0.15em] opacity-60 text-steel-500">{label}</p>
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
