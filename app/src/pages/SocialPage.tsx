// 图片代理工具函数：使用 images.weserv.nl 全球 CDN，国内可访问
function getProxiedImageUrl(originalUrl: string): string {
  if (!originalUrl) return '';
  
  // 判断是否是境外域名（需要代理）
  const foreignDomains = [
    'pbs.twimg.com',
    'instagram.com',
    'instagram.fs',
    'fbcdn.net',
    'twimg.com',
    'twitter.com',
    'x.com',
    'fbcdn.net',
  ];
  
  const isForeign = foreignDomains.some(domain => 
    originalUrl.toLowerCase().includes(domain)
  );
  
  if (isForeign) {
    // 使用 images.weserv.nl 全球 CDN 代理，国内无需 VPN 可访问
    // 支持参数：?w=800&h=600&fit=cover&output=webp
    return `https://images.weserv.nl/?url=${encodeURIComponent(originalUrl)}&n=-1`;
  }
  
  return originalUrl;
}
import { useState, useMemo, useEffect, useRef } from "react";

// 图片代理工具函数：把境外图片 URL 转换成 Cloudflare Worker 代理 URL
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Pin,
  MessageSquare,
  Calendar,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadSocialData,
  saveSocialData,
  syncSocialData,
  socialCategories,
  categoryStyles,
  platformVisualStyles,
  allPlatforms,
  formatRelativeTime,
  formatAbsoluteTime,
  type SocialPost,
  type SocialCategory,
  type SocialPlatform,
} from "@/lib/socialData";
import { extractYouTubeId } from "@/lib/videoFetcher";
import { extractBilibiliId } from "@/lib/showData";
import { memberColors } from "@/lib/showData";
import type { ShowMember } from "@/lib/showData";
import { useAuth } from "@/context/AuthContext";
import SocialFormModal from "@/components/SocialFormModal";
import DeleteConfirmDialog from "@/components/DeleteConfirmDialog";

/** 将视频 URL 转为嵌入链接（YouTube / Bilibili），非视频 URL 返回 null */
function getVideoEmbedUrl(url: string): { src: string; platform: "youtube" | "bilibili" } | null {
  const ytId = extractYouTubeId(url);
  if (ytId) {
    return { src: `https://www.youtube.com/embed/${ytId}`, platform: "youtube" };
  }
  const bvId = extractBilibiliId(url);
  if (bvId) {
    return { src: `https://player.bilibili.com/player.html?bvid=${bvId}&page=1`, platform: "bilibili" };
  }
  return null;
}

export default function SocialPage() {
  const { isAdmin } = useAuth();

  const [socialData, setSocialData] = useState<SocialPost[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<SocialCategory>>(new Set());
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<SocialPlatform>>(new Set());

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SocialPost | null>(null);
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [detailImageIdx, setDetailImageIdx] = useState(0);

  // Prevent stale localStorage data from overwriting Supabase on initial load
  const initialLoadRef = useRef(true);
  const userModifiedRef = useRef(false);

  useEffect(() => {
    setSocialData(loadSocialData());
    syncSocialData().then((data) => {
      if (!userModifiedRef.current) {
        setSocialData(data);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (socialData.length > 0) {
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        return;
      }
      userModifiedRef.current = true;
      saveSocialData(socialData).then(({ error }) => {
        if (error) {
          toast.error("云端同步失败", { description: error });
        }
      }).catch(() => {});
    }
  }, [socialData]);

  const toggleCategory = (cat: SocialCategory) => {
    const next = new Set(selectedCategories);
    if (next.has(cat)) {
      next.delete(cat);
    } else {
      next.add(cat);
    }
    setSelectedCategories(next);
  };

  const togglePlatform = (plat: SocialPlatform) => {
    const next = new Set(selectedPlatforms);
    if (next.has(plat)) {
      next.delete(plat);
    } else {
      next.add(plat);
    }
    setSelectedPlatforms(next);
  };

  const sortedAndFilteredData = useMemo(() => {
    let result = [...socialData];

    // Filter by selected categories
    if (selectedCategories.size > 0) {
      result = result.filter((post) => post.category && selectedCategories.has(post.category));
    }

    // Filter by selected platforms
    if (selectedPlatforms.size > 0) {
      result = result.filter((post) => selectedPlatforms.has(post.platform));
    }

    // Sort: pinned first, then by date descending
    result.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.postDate).getTime() - new Date(a.postDate).getTime();
    });

    return result;
  }, [socialData, selectedCategories, selectedPlatforms]);

  const handleAdd = () => {
    setEditingPost(null);
    setFormOpen(true);
  };

  const handleEdit = (post: SocialPost) => {
    setEditingPost(post);
    setFormOpen(true);
  };

  const handleSave = (post: SocialPost) => {
    if (editingPost) {
      setSocialData((prev) => prev.map((p) => (p.id === post.id ? post : p)));
      toast.success("动态已更新", { description: post.content.slice(0, 30) + "..." });
    } else {
      setSocialData((prev) => [post, ...prev]);
      toast.success("动态已添加", { description: post.content.slice(0, 30) + "..." });
    }
    setFormOpen(false);
    setEditingPost(null);
  };

  const handleDelete = (post: SocialPost) => {
    setSocialData((prev) => prev.filter((p) => p.id !== post.id));
    toast.success("动态已删除");
  };

  const togglePin = (post: SocialPost) => {
    setSocialData((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, pinned: !p.pinned } : p))
    );
    toast.success(post.pinned ? "已取消置顶" : "已置顶", {
      description: post.content.slice(0, 30) + "...",
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Page toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-rose-400 to-sky-500 text-white text-sm font-bold">
            BTOB · 任炫植
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">社交平台动态</h1>
            <p className="text-sm text-gray-500">多平台动态聚合 · 时间轴排序</p>
          </div>
        </div>

        {isAdmin && (
          <div className="flex gap-2">
<button
              onClick={handleAdd}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-400 to-sky-500 text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-md shadow-sky-200 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              添加动态
            </button>
          </div>
        )}
      </div>

      {/* Filter tags */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 space-y-3">
        {/* Category filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 mr-1">分类：</span>
          {socialCategories.map((cat) => {
            const isActive = selectedCategories.has(cat.key);
            const style = categoryStyles[cat.key];
            return (
              <button
                key={cat.key}
                onClick={() => toggleCategory(cat.key)}
                title={cat.desc}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  isActive ? style.active : style.inactive
                }`}
              >
                {isActive && <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
                {cat.label}
              </button>
            );
          })}
          {selectedCategories.size > 0 && (
            <button
              onClick={() => setSelectedCategories(new Set())}
              className="px-3 py-1.5 rounded-full text-xs text-gray-400 hover:text-red-500 transition-colors ml-1"
            >
              清除分类
            </button>
          )}
        </div>

        {/* Platform filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 mr-1">平台：</span>
          {allPlatforms.map((plat) => {
            const isActive = selectedPlatforms.has(plat);
            const style = platformVisualStyles[plat];
            return (
              <button
                key={plat}
                onClick={() => togglePlatform(plat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isActive
                    ? style.bg + " " + style.text + " shadow-sm"
                    : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                }`}
              >
                {style.label}
              </button>
            );
          })}
          {selectedPlatforms.size > 0 && (
            <button
              onClick={() => setSelectedPlatforms(new Set())}
              className="px-3 py-1.5 rounded-full text-xs text-gray-400 hover:text-red-500 transition-colors ml-1"
            >
              清除平台
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">
            {selectedCategories.size > 0 || selectedPlatforms.size > 0
              ? `分类 ${selectedCategories.size} 个 · 平台 ${selectedPlatforms.size} 个 · ${sortedAndFilteredData.length} 条动态`
              : `全部 · ${sortedAndFilteredData.length} 条动态`}
          </span>
        </div>
      </div>

      {/* Masonry layout using CSS columns */}
      <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-5 space-y-5">
        <AnimatePresence mode="popLayout">
          {sortedAndFilteredData.map((post) => {
            const platformStyle = platformVisualStyles[post.platform];
            const catStyle = post.category ? categoryStyles[post.category] : categoryStyles["个人动态"];
            return (
              <motion.div
                key={post.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className="break-inside-avoid mb-5 group relative bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => { setSelectedPost(post); setDetailImageIdx(0); }}
              >
                {/* Card header */}
                <div className="p-4 pb-2">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Platform icon */}
                      <div
                        className={`shrink-0 w-7 h-7 rounded-lg ${platformStyle.bg} ${platformStyle.text} flex items-center justify-center text-xs font-bold`}
                      >
                        {platformStyle.label.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {post.author}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {platformStyle.label} · {formatRelativeTime(post.postDate)}
                        </p>
                      </div>
                    </div>
                    
                    {/* Category tag */}
                    <div className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium border ${catStyle.inactive}`}>
                      {post.category}
                    </div>

                    {/* Pinned indicator */}
                    {post.pinned && (
                      <div className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        <Pin className="w-2.5 h-2.5" />
                        置顶
                      </div>
                    )}

                    {/* Admin buttons */}
                    {isAdmin && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEdit(post); }}
                          className="w-6 h-6 rounded-md bg-gray-50 flex items-center justify-center text-gray-500 hover:text-sky-500 hover:bg-sky-50 transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); togglePin(post); }}
                          className="w-6 h-6 rounded-md bg-gray-50 flex items-center justify-center text-gray-500 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                          title={post.pinned ? "取消置顶" : "置顶"}
                        >
                          <Pin className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(post); }}
                          className="w-6 h-6 rounded-md bg-gray-50 flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Category tag */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${catStyle.active}`}
                    >
                      {post.category}
                    </span>
                    {post.member && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${memberColors[post.member as ShowMember]}`}
                      >
                        {post.member}
                      </span>
                    )}
                  </div>
                </div>

                {/* Content text */}
                {post.content && (
                  <div className="px-4 pb-2">
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap line-clamp-6">
                      {post.content}
                    </p>
                  </div>
                )}

                {/* Images */}
                {post.images.length > 0 && (
                  <div className="px-4 pb-3">
                    <ImageGrid images={post.images} />
                  </div>
                )}

                {/* Videos */}
                {post.videos && post.videos.length > 0 && (
                  <div className="px-4 pb-3 space-y-2">
                    {post.videos.map((videoUrl, vi) => {
                      const embed = getVideoEmbedUrl(videoUrl);
                      if (!embed) return null;
                      return (
                        <div
                          key={vi}
                          className="relative w-full rounded-xl overflow-hidden bg-black"
                          style={{ aspectRatio: "16/9" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <iframe
                            src={embed.src}
                            className="absolute inset-0 w-full h-full"
                            allowFullScreen
                            title={`视频 ${vi + 1}`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Card footer */}
                <div className="px-4 py-3 border-t border-gray-50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" />
                      {formatAbsoluteTime(post.postDate)}
                    </span>
                  </div>
                  {post.postUrl && (
                    <a
                      href={post.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-[10px] text-sky-500 hover:text-sky-600 font-medium transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      查看原帖
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Empty state */}
      {sortedAndFilteredData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-3">
            <MessageSquare className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-sm text-gray-500 mb-1">没有找到匹配的动态</p>
          <p className="text-xs text-gray-400">
            {selectedCategories.size > 0
              ? "尝试调整筛选标签或清除筛选"
              : "管理员可点击「添加动态」创建内容"}
          </p>
        </div>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedPost && (
          <DetailModal
            post={selectedPost}
            imageIdx={detailImageIdx}
            onImageIdxChange={setDetailImageIdx}
            onClose={() => { setSelectedPost(null); setDetailImageIdx(0); }}
          />
        )}
      </AnimatePresence>

      {/* Modals */}
      <SocialFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingPost(null);
        }}
        onSave={handleSave}
        editingPost={editingPost}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="删除动态"
        message={`确定要删除这条动态吗？此操作不可撤销。`}
      />
    </div>
  );
}

/** 动态详情弹窗 */
function DetailModal({
  post,
  imageIdx,
  onImageIdxChange,
  onClose,
}: {
  post: SocialPost;
  imageIdx: number;
  onImageIdxChange: (idx: number) => void;
  onClose: () => void;
}) {
  const platformStyle = platformVisualStyles[post.platform];
  const catStyle = post.category ? categoryStyles[post.category] : categoryStyles["个人动态"];

  // Keyboard: Escape to close, left/right to navigate images
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (post.images.length <= 1) return;
      if (e.key === "ArrowLeft") onImageIdxChange((imageIdx - 1 + post.images.length) % post.images.length);
      if (e.key === "ArrowRight") onImageIdxChange((imageIdx + 1) % post.images.length);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, imageIdx, post.images.length, onImageIdxChange]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/40 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Image gallery */}
          {post.images.length > 0 && (
            <div className="relative bg-gray-100">
              <div className="relative" style={{ aspectRatio: post.images.length === 1 ? "auto" : "16/10" }}>
                <img
                  src={getProxiedImageUrl(post.images[imageIdx])}
                  alt={`图片 ${imageIdx + 1}`}
                  className="w-full h-full object-contain max-h-[50vh]"
                />
                {post.images.length > 1 && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onImageIdxChange((imageIdx - 1 + post.images.length) % post.images.length);
                      }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onImageIdxChange((imageIdx + 1) % post.images.length);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    {/* Dots indicator */}
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {post.images.map((_, i) => (
                        <button
                          key={i}
                          onClick={(e) => { e.stopPropagation(); onImageIdxChange(i); }}
                          className={`w-1.5 h-1.5 rounded-full transition-all ${
                            i === imageIdx ? "bg-white w-3" : "bg-white/50"
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Videos (in detail view, no thumbnail cover) */}
          {post.videos && post.videos.length > 0 && post.images.length === 0 && (
            <div className="space-y-2 p-4 pb-0">
              {post.videos.map((videoUrl, vi) => {
                const embed = getVideoEmbedUrl(videoUrl);
                if (!embed) return null;
                return (
                  <div
                    key={vi}
                    className="relative w-full rounded-xl overflow-hidden bg-black"
                    style={{ aspectRatio: "16/9" }}
                  >
                    <iframe
                      src={embed.src}
                      className="absolute inset-0 w-full h-full"
                      allowFullScreen
                      title={`视频 ${vi + 1}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Content area */}
          <div className="p-6 pt-5">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`shrink-0 w-10 h-10 rounded-xl ${platformStyle.bg} ${platformStyle.text} flex items-center justify-center text-sm font-bold`}
              >
                {platformStyle.label.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-gray-900">{post.author}</p>
                <p className="text-xs text-gray-400">
                  {platformStyle.label} · {formatAbsoluteTime(post.postDate)}
                  {post.pinned && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-amber-600">
                      <Pin className="w-2.5 h-2.5" />
                      置顶
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Tags */}
            <div className="flex items-center gap-1.5 mb-4">
              <span
                className={`text-xs px-2 py-0.5 rounded-full border font-medium ${catStyle.active}`}
              >
                {post.category}
              </span>
              {post.member && (
                <span
                  className={`text-xs px-2 py-0.5 rounded border font-medium ${memberColors[post.member as ShowMember]}`}
                >
                  {post.member}
                </span>
              )}
            </div>

            {/* Full content */}
            {post.content && (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-4">
                {post.content}
              </p>
            )}

            {/* Videos below content (when images also exist) */}
            {post.videos && post.videos.length > 0 && post.images.length > 0 && (
              <div className="space-y-2 mb-4">
                {post.videos.map((videoUrl, vi) => {
                  const embed = getVideoEmbedUrl(videoUrl);
                  if (!embed) return null;
                  return (
                    <div
                      key={vi}
                      className="relative w-full rounded-xl overflow-hidden bg-black"
                      style={{ aspectRatio: "16/9" }}
                    >
                      <iframe
                        src={embed.src}
                        className="absolute inset-0 w-full h-full"
                        allowFullScreen
                        title={`视频 ${vi + 1}`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Source link */}
            {post.postUrl && (
              <a
                href={post.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-50 text-sm text-sky-600 hover:bg-sky-50 font-medium transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                查看原帖
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** 图片网格组件，根据图片数量自动布局 */
function ImageGrid({ images }: { images: string[] }) {
  if (images.length === 0) return null;

  if (images.length === 1) {
    return (
      <div className="rounded-xl overflow-hidden bg-gray-50">
        <img
          src={getProxiedImageUrl(images[0])}
          alt="动态图片"
          loading="lazy"
          className="w-full max-h-80 object-cover"
          onError={(e) => {
            const target = e.currentTarget;
            target.parentElement!.innerHTML = `
              <div class="w-full h-40 flex items-center justify-center bg-gray-50 text-gray-300">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21,15 16,10 5,21"/>
                </svg>
              </div>
            `;
          }}
        />
      </div>
    );
  }

  if (images.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
        {images.map((img, i) => (
          <img
            key={i}
            src={getProxiedImageUrl(img)}
            alt={`动态图片 ${i + 1}`}
            loading="lazy"
            className="w-full h-40 object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ))}
      </div>
    );
  }

  if (images.length === 3) {
    return (
      <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
        <img
          src={getProxiedImageUrl(images[0])}
          alt="动态图片 1"
          loading="lazy"
          className="w-full h-40 object-cover row-span-2"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <img
          src={images[1]}
          alt="动态图片 2"
          loading="lazy"
          className="w-full h-40 object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <img
          src={images[2]}
          alt="动态图片 3"
          loading="lazy"
          className="w-full h-40 object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    );
  }

  // 4+ images: show 4, with "+N" overlay
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
      {images.slice(0, 4).map((img, i) => (
        <div key={i} className="relative">
          <img
            src={getProxiedImageUrl(img)}
            alt={`动态图片 ${i + 1}`}
            loading="lazy"
            className="w-full h-32 object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          {i === 3 && images.length > 4 && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white text-lg font-bold">+{images.length - 4}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
