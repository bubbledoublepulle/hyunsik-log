import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Disc3,
  Sparkles,
  ListMusic,
  ArrowUpDown,
  RotateCcw,
  LayoutGrid,
  Album,
  Music,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadMusicData,
  saveMusicData,
  syncMusicData,
  resetMusicData,
  fromDbRow,
  type MusicItem,
  type MusicType,
  type MusicRole,
} from "@/lib/musicData";
import { useAuth } from "@/context/AuthContext";
import FilterSidebar from "@/components/FilterSidebar";
import MusicFormModal from "@/components/MusicFormModal";
import DeleteConfirmDialog from "@/components/DeleteConfirmDialog";
import { StatCard } from "@/components/StatCard";
import { useRealtimeData } from "@/hooks/useRealtimeData";

const allTypes: MusicType[] = ["团体", "SOLO", "OST", "合作"];
const allRoles: MusicRole[] = ["演唱", "作曲", "作词", "编曲"];

type SortBy = "date-desc" | "date-asc" | "title-asc";
type ViewMode = "table" | "album";

export default function MusicPage() {
  const { isAdmin } = useAuth();
  const { data: rtMusicData, isSubscribed } = useRealtimeData("music");

  const [musicData, setMusicData] = useState<MusicItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date-desc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // Filters
  const [selectedTypes, setSelectedTypes] = useState<Set<MusicType>>(new Set());
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [selectedRoles, setSelectedRoles] = useState<Set<MusicRole>>(new Set());
  const [onlySelfComposed, setOnlySelfComposed] = useState(false);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MusicItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MusicItem | null>(null);

  // Prevent stale localStorage data from overwriting Supabase on initial load
  const initialLoadRef = useRef(true);
  const userModifiedRef = useRef(false);

  // Load data on mount + sync from Supabase
  // 实时同步：监听 Supabase 推送的数据变化（访客自动收到管理员更新）
  const prevRtMusicCountRef = useRef(0);
  const rtMusicNotifiedRef = useRef(false);
  useEffect(() => {
    if (!rtMusicData || rtMusicData.length === 0) return;
    // 仅在用户未进行本地修改时，用云端数据覆盖本地
    if (!userModifiedRef.current) {
      const items = rtMusicData.map((row: any) => fromDbRow(row));
      setMusicData(items);
      // 同时更新 localStorage 缓存，下次加载更快
      try {
        localStorage.setItem("hsik_music_data", JSON.stringify(items));
      } catch {
        // ignore
      }
      // 访客模式下，数据真正变化时给出微妙提示（跳过首次加载）
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
      // Only apply synced data if user hasn't made changes yet
      if (!userModifiedRef.current) {
        setMusicData(data);
      }
    }).catch(() => {});
  }, []);

  // Save data whenever it changes (skip initial load to avoid overwriting Supabase)
  useEffect(() => {
    if (musicData.length > 0) {
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        return;
      }
      userModifiedRef.current = true;
      saveMusicData(musicData).then(({ error }) => {
        if (error) {
          toast.error("云端同步失败", { description: error });
        }
      }).catch(() => {});
    }
  }, [musicData]);

  // Extract years from data
  const years = useMemo(() => {
    const yearSet = new Set<number>();
    musicData.forEach((item) => {
      const year = new Date(item.releaseDate).getFullYear();
      if (!isNaN(year)) yearSet.add(year);
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [musicData]);

  // Filter and sort
  const filteredData = useMemo(() => {
    let result = [...musicData];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.album.toLowerCase().includes(q)
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
      result = result.filter((item) =>
        item.roles.some((r) => selectedRoles.has(r))
      );
    }

    if (onlySelfComposed) {
      result = result.filter((item) => item.isSelfComposed);
    }

    switch (sortBy) {
      case "date-desc":
        result.sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
        break;
      case "date-asc":
        result.sort((a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime());
        break;
      case "title-asc":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }

    return result;
  }, [musicData, searchQuery, selectedTypes, selectedYears, selectedRoles, onlySelfComposed, sortBy]);

  // Stats
  const stats = useMemo(() => {
    const total = musicData.length;
    const selfComposed = musicData.filter((m) => m.isSelfComposed).length;
    const types = new Set(musicData.map((m) => m.type)).size;
    return { total, selfComposed, types };
  }, [musicData]);

  // Album grouping for album view
  const albumGroups = useMemo(() => {
    const groups = new Map<string, MusicItem[]>();
    filteredData.forEach((item) => {
      const key = item.album;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
    // Sort albums by latest song in each
    return Array.from(groups.entries())
      .map(([album, songs]) => ({ album, songs }))
      .sort((a, b) => {
        const aLatest = Math.max(...a.songs.map((s) => new Date(s.releaseDate).getTime()));
        const bLatest = Math.max(...b.songs.map((s) => new Date(s.releaseDate).getTime()));
        return bLatest - aLatest;
      });
  }, [filteredData]);

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

  const handleDelete = (item: MusicItem) => {
    setMusicData((prev) => prev.filter((m) => m.id !== item.id));
    toast.success("已删除", { description: item.title });
  };

  const handleReset = async () => {
    setMusicData(await resetMusicData());
    clearAllFilters();
    toast.success("数据已重置", { description: "恢复到初始 12 条音乐档案" });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">



        {/* 实时同步状态 */}
        <div style={{ position: "fixed", top: 80, right: 16, zIndex: 50 }}>
          <span style={{ fontSize: 12, padding: "4px 8px", borderRadius: 20, background: isSubscribed ? "#dcfce7" : "#fef3c7", color: isSubscribed ? "#166534" : "#92400e" }}>
            {isSubscribed ? "🟢 实时同步中" : "🟡 连接中..."}
          </span>
        </div>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2 py-0.5 rounded-md bg-sky-100 text-sky-600 font-medium">
              MUSIC ARCHIVE
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">音乐档案</h1>
          <p className="text-sm text-gray-500 mt-0.5">任炫植音乐作品结构化档案</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                重置数据
              </button>
              <button
                onClick={handleAdd}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-400 text-white text-sm font-medium hover:bg-sky-500 transition-colors shadow-md shadow-sky-200"
              >
                <Plus className="w-4 h-4" />
                添加歌曲
              </button>
            </>
          )}

          {/* View toggle */}
          <div className="flex p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === "table"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              表格
            </button>
            <button
              onClick={() => setViewMode("album")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === "album"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              <Album className="w-3.5 h-3.5" />
              专辑
            </button>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="作品总数"
          value={stats.total}
          icon={ListMusic}
          color="text-sky-500"
          bg="bg-sky-50"
          delay={0}
        />
        <StatCard
          label="自作曲"
          value={stats.selfComposed}
          icon={Sparkles}
          color="text-violet-500"
          bg="bg-violet-50"
          delay={0.05}
        />
        <StatCard
          label="作品类型"
          value={stats.types}
          icon={Disc3}
          color="text-emerald-500"
          bg="bg-emerald-50"
          delay={0.1}
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
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

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Search & sort */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索歌曲名称或专辑..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all"
              />
            </div>
            <div className="relative">
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all cursor-pointer appearance-none"
              >
                <option value="date-desc">最新发行</option>
                <option value="date-asc">最早发行</option>
                <option value="title-asc">名称排序</option>
              </select>
            </div>
          </div>

          {viewMode === "table" ? (
            <>
          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">
                      歌曲
                    </th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3 hidden md:table-cell">
                      专辑
                    </th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">
                      类型
                    </th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">
                      角色
                    </th>
                    <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {filteredData.map((item, index) => (
                      <motion.tr
                        key={item.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`group relative border-b border-gray-50 last:border-0 hover:bg-sky-50/30 transition-colors ${
                          index % 2 === 1 ? "bg-gray-50/30" : ""
                        } ${item.isSelfComposed ? "shadow-[inset_3px_0_0_0_#42B4E6]" : ""}`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-gray-900 text-sm">{item.title}</span>
                                {item.isSelfComposed && (
                                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                                )}
                              </div>
                              <span className="text-xs text-gray-400">{item.releaseDate}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <span className="text-sm text-gray-600">{item.album}</span>
                        </td>
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <span className="text-xs px-2 py-1 rounded-md bg-gray-50 text-gray-500 font-medium">
                            {item.type}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {item.roles.map((role) => (
                              <span
                                key={role}
                                className="text-xs px-1.5 py-0.5 rounded border border-sky-100 bg-sky-50 text-sky-600 font-medium"
                              >
                                {role}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <a
                              href={item.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-sky-50 hover:text-sky-500 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => handleEdit(item)}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-sky-50 hover:text-sky-500 transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(item)}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                >
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
                <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                  <ListMusic className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500 mb-1">没有找到匹配的作品</p>
                <p className="text-xs text-gray-400">尝试调整筛选条件或清除所有筛选</p>
              </div>
            )}
          </div>
            </>
          ) : (
            <>
          {/* Album View */}
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {albumGroups.map((group, gi) => {
                const albumSongCount = group.songs.length;
                const albumSelfCount = group.songs.filter((s) => s.isSelfComposed).length;
                const albumDate = group.songs
                  .map((s) => s.releaseDate)
                  .sort()
                  [0] || "";

                return (
                  <motion.div
                    key={group.album}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: gi * 0.06 }}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                  >
                    {/* Album Header */}
                    <div className="px-3 sm:px-5 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
                          <Album className="w-5 h-5 text-sky-500" />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900">{group.album}</h3>
                          <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Music className="w-3 h-3" />
                              {albumSongCount} 首歌
                            </span>
                            {albumSelfCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-sky-400" />
                                {albumSelfCount} 首自作曲
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {albumDate}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right" />
                    </div>

                    {/* Songs list inside album */}
                    <div className="divide-y divide-gray-50">
                      {group.songs.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-center px-3 sm:px-5 py-3 hover:bg-sky-50/30 transition-colors ${
                            item.isSelfComposed ? "shadow-[inset_3px_0_0_0_#42B4E6]" : ""
                          }`}
                        >
                          {/* Song info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 text-sm truncate">
                                {item.title}
                              </span>
                              {item.isSelfComposed && (
                                <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                              )}
                              <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-50 text-gray-400 font-medium shrink-0">
                                {item.type}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                              <span>{item.releaseDate}</span>
                              <span className="flex flex-wrap gap-1">
                                {item.roles.map((role) => (
                                  <span
                                    key={role}
                                    className="text-[10px] px-1 py-0.5 rounded border border-sky-100 bg-sky-50 text-sky-600 font-medium"
                                  >
                                    {role}
                                  </span>
                                ))}
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-0.5">
                            <a
                              href={item.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-sky-50 hover:text-sky-500 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => handleEdit(item)}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-sky-50 hover:text-sky-500 transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(item)}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {albumGroups.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                  <Album className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500 mb-1">没有找到匹配的专辑</p>
                <p className="text-xs text-gray-400">尝试调整筛选条件或清除所有筛选</p>
              </div>
            )}
          </div>
            </>
          )}

          <p className="text-xs text-gray-400 mt-3">
            共 {filteredData.length} 条结果
            {filteredData.length !== musicData.length && ` (总计 ${musicData.length} 条)`}
          </p>
        </div>
      </div>

      {/* Modals */}
      <MusicFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSave={handleSave}
        editingItem={editingItem}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="删除歌曲"
        message={`确定要删除「${deleteTarget?.title}」吗？此操作不可撤销。`}
      />
    </div>
  );
}

