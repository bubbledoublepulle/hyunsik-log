import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, MessageSquare, Save, Plus, Trash2, Search, Loader2, CheckCircle2,
  Image as ImageIcon, Video,
} from "lucide-react";
import { toast } from "sonner";
import type {
  SocialPost,
  SocialCategory,
  SocialPlatform,
} from "@/lib/socialData";
import {
  socialCategories,
  platformVisualStyles,
} from "@/lib/socialData";
import type { ShowMember } from "@/lib/showData";
import {
  detectSocialPlatform,
  fetchLinkPreview,
  type LinkPreview,
} from "@/lib/linkPreviewFetcher";

interface SocialFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (post: SocialPost) => void;
  editingPost: SocialPost | null;
}

const allMembers: (ShowMember | "")[] = [
  "",
  "任炫植",
  "徐恩光",
  "李旼赫",
  "李昌燮",
  "Peniel",
  "陆星材",
  "全体",
];

export default function SocialFormModal({
  open,
  onClose,
  onSave,
  editingPost,
}: SocialFormModalProps) {
  const [categories, setCategories] = useState<Set<SocialCategory>>(new Set(["个人动态"]));
  const [platform, setPlatform] = useState<SocialPlatform>("Weverse");
  const [author, setAuthor] = useState("");
  const [member, setMember] = useState<ShowMember | "">("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [postUrl, setPostUrl] = useState("");
  const [postDate, setPostDate] = useState("");
  const [pinned, setPinned] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 链接预览抓取状态
  const [fetchState, setFetchState] = useState<"idle" | "fetching" | "done" | "error">("idle");
  const [fetchedFields, setFetchedFields] = useState<Set<string>>(new Set());
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  useEffect(() => {
    if (editingPost) {
      setCategories(new Set(editingPost.categories || (editingPost.category ? [editingPost.category] : ["个人动态"])));
      setPlatform(editingPost.platform);
      setAuthor(editingPost.author);
      setMember(editingPost.member || "");
      setContent(editingPost.content);
      setImages(editingPost.images ? [...editingPost.images] : []);
      setVideos(editingPost.videos ? [...editingPost.videos] : []);
      setPostUrl(editingPost.postUrl);
      // Convert ISO to datetime-local format
      const d = new Date(editingPost.postDate);
      const localISO = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setPostDate(localISO);
      setPinned(editingPost.pinned || false);
    } else {
      // 新建动态时清除缓存，确保抓取最新数据
      if (typeof window !== "undefined") {
        localStorage.removeItem("hsik_link_preview_cache");
        localStorage.removeItem("hsik_video_fetch_cache");
      }
      
      setCategories(new Set(["个人动态"]));
      setPlatform("Weverse");
      setAuthor("");
      setMember("");
      setContent("");
      setImages([]);
      setVideos([]);
      setPostUrl("");
      // Default to now
      const now = new Date();
      const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setPostDate(localISO);
      setPinned(false);
    }
    setErrors({});
    // 重置抓取状态
    setFetchState("idle");
    setFetchedFields(new Set());
    setDetectedPlatform(null);
    setImagePreviews([]);
  }, [editingPost, open]);

  // 分类标签多选切换
  const toggleCategory = (cat: SocialCategory) => {
    const next = new Set(categories);
    if (next.has(cat)) {
      next.delete(cat);
    } else {
      next.add(cat);
    }
    setCategories(next);
  };

  const addImage = () => {
    setImages([...images, ""]);
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const updateImage = (index: number, value: string) => {
    const next = [...images];
    next[index] = value;
    setImages(next);
  };

  const addVideo = () => {
    setVideos([...videos, ""]);
  };

  const removeVideo = (index: number) => {
    setVideos(videos.filter((_, i) => i !== index));
  };

  const updateVideo = (index: number, value: string) => {
    const next = [...videos];
    next[index] = value;
    setVideos(next);
  };

  // ========== URL 自动识别 ==========

  function handleUrlBlur(url: string) {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setDetectedPlatform(null);
      return;
    }
    const detected = detectSocialPlatform(cleanUrl);
    if (detected === "unknown") {
      setDetectedPlatform(null);
    } else {
      setDetectedPlatform(detected);
    }
    if (fetchState === "error") setFetchState("idle");
  }

  // ========== 链接预览抓取 ==========

  async function handleFetchPreview() {
    const url = postUrl.trim();
    if (!url) {
      toast.error("请先填写原帖链接");
      return;
    }

    setFetchState("fetching");
    setImagePreviews([]);

    try {
      const preview: LinkPreview = await fetchLinkPreview(url);

      const filled: Set<string> = new Set();

      // 标题 + 描述 → 文字内容
      const textParts: string[] = [];
      if (preview.title) {
        textParts.push(preview.title);
      }
      if (preview.description && preview.description !== preview.title) {
        textParts.push(preview.description);
      }
      if (textParts.length > 0) {
        setContent(textParts.join("\n\n"));
        filled.add("content");
      }

      // 图片
      if (preview.images.length > 0) {
        setImages(preview.images);
        setImagePreviews(preview.images);
        filled.add("images");
      }

      // 日期
      if (preview.date) {
        try {
          const d = new Date(preview.date);
          if (!isNaN(d.getTime())) {
            const localISO = new Date(
              d.getTime() - d.getTimezoneOffset() * 60000
            )
              .toISOString()
              .slice(0, 16);
            setPostDate(localISO);
            filled.add("date");
          }
        } catch {
          // 日期解析失败，忽略
        }
      }

      // 作者
      if (preview.author) {
        setAuthor(preview.author);
        filled.add("author");
      }

      // 平台自动匹配
      if (detectedPlatform && detectedPlatform !== "unknown") {
        const platformMap: Record<string, SocialPlatform> = {
          X: "X",
          Instagram: "Instagram",
          Weverse: "Weverse",
          "YouTube Community": "YouTube Community",
          fromm: "fromm",
          "Fan Club": "Fan Club",
        };
        const mapped = platformMap[detectedPlatform];
        if (mapped) {
          setPlatform(mapped);
          filled.add("platform");
          // 同时更新分类
          if (!editingPost) {
            // 自动添加检测到的平台作为分类标签
            if (detectedPlatform) {
              const detectedCat = detectedPlatform as SocialCategory;
              if (socialCategories.some(c => c.key === detectedCat)) {
                setCategories(prev => new Set([...prev, detectedCat]));
                filled.add("categories");
              }
            }
          }
        }
      }

      setFetchedFields(filled);
      setFetchState("done");

      toast.success(`已从链接抓取 ${filled.size} 项数据`, {
        description: "可手动修改任何字段后保存",
      });
    } catch (e: unknown) {
      setFetchState("error");
      const msg =
        e instanceof Error ? e.message : "数据抓取失败，请手动填写";
      toast.error(msg);
    }
  }

  const validate = () => {
    const e: Record<string, string> = {};
    if (!author.trim()) e.author = "请输入发布者名称";
    if (!content.trim() && images.filter((i) => i.trim()).length === 0) {
      e.content = "请至少填写文字内容或一张图片";
    }
    // postUrl 为可选字段，不再校验
    if (!postDate) e.postDate = "请选择发布时间";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const validImages = images.filter((i) => i.trim());
    const validVideos = videos.filter((v) => v.trim());

    onSave({
      id: editingPost?.id || `p${Date.now()}`,
      categories: Array.from(categories),
      category: Array.from(categories)[0] as SocialCategory, // 兼容旧数据
      platform,
      author: author.trim(),
      member: member || undefined,
      content: content.trim(),
      images: validImages,
      videos: validVideos,
      postUrl: postUrl.trim(),
      postDate: new Date(postDate).toISOString(),
      pinned,
    });
  };

  const allPlatforms: SocialPlatform[] = [
    "X",
    "Instagram",
    "fromm",
    "bubble",
    "Weverse",
    "YouTube Community",
    "Fan Club",
  ];

  // 抓取到的字段显示绿色标记
  const fieldBadge = (field: string) =>
    fetchedFields.has(field) ? (
      <span className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 text-[10px] bg-emerald-50 text-emerald-600 rounded-full font-medium">
        <CheckCircle2 className="w-2.5 h-2.5" />
        已抓取
      </span>
    ) : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin bg-white rounded-2xl shadow-2xl border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-rose-400 to-sky-500 px-6 py-5 flex items-center justify-between z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-lg font-bold text-white">
                  {editingPost ? "编辑动态" : "添加动态"}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Category */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  分类标签 <span className="text-red-400">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {socialCategories.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => toggleCategory(cat.key)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        categories.has(cat.key)
                          ? "bg-sky-400 text-white border-sky-400"
                          : "bg-white text-gray-500 border-gray-200 hover:border-sky-300"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Platform & Author */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    发布平台
                  </label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all bg-white"
                  >
                    {allPlatforms.map((p) => (
                      <option key={p} value={p}>
                        {platformVisualStyles[p].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center">
                    发布者 <span className="text-red-400 ml-0.5">*</span>
                    {fieldBadge("author")}
                  </label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="@username 或名称"
                    className={`w-full px-3.5 py-2.5 rounded-xl border-2 transition-all outline-none ${
                      errors.author
                        ? "border-red-300 bg-red-50"
                        : fetchedFields.has("author")
                        ? "border-emerald-200 bg-emerald-50/30"
                        : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    }`}
                  />
                  {errors.author && <p className="text-xs text-red-500 mt-1">{errors.author}</p>}
                </div>
              </div>

              {/* Member */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  关联成员 <span className="text-xs text-gray-400 font-normal ml-1">（可选）</span>
                </label>
                <select
                  value={member}
                  onChange={(e) => setMember(e.target.value as ShowMember | "")}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all bg-white"
                >
                  {allMembers.map((m) => (
                    <option key={m} value={m}>{m || "不关联"}</option>
                  ))}
                </select>
              </div>

              {/* Content */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center">
                  文字内容 <span className="text-red-400 ml-0.5">*</span>
                  {fieldBadge("content")}
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="输入动态内容..."
                  rows={4}
                  className={`w-full px-3.5 py-2.5 rounded-xl border-2 transition-all outline-none resize-none ${
                    errors.content
                      ? "border-red-300 bg-red-50"
                      : fetchedFields.has("content")
                      ? "border-emerald-200 bg-emerald-50/30"
                      : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  }`}
                />
                {errors.content && <p className="text-xs text-red-500 mt-1">{errors.content}</p>}
              </div>

              {/* Images */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700 flex items-center">
                    图片链接
                    <span className="text-xs text-gray-400 font-normal ml-1">（可选）</span>
                    {fieldBadge("images")}
                  </label>
                  <button
                    type="button"
                    onClick={addImage}
                    className="flex items-center gap-1 text-xs text-sky-500 hover:text-sky-600 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加图片
                  </button>
                </div>
                <div className="space-y-2">
                  {images.length === 0 && (
                    <p className="text-xs text-gray-400 py-2">暂无图片，点击「添加图片」输入 URL</p>
                  )}
                  {images.map((img, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <input
                        type="url"
                        value={img}
                        onChange={(e) => updateImage(index, e.target.value)}
                        placeholder="https://..."
                        className="flex-1 px-3 py-2 rounded-lg border-2 border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* 图片预览（抓取后展示） */}
                {imagePreviews.length > 0 && (
                  <div className="mt-3 rounded-xl overflow-hidden border-2 border-emerald-200">
                    <div className="bg-emerald-50 px-3 py-1.5 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <ImageIcon className="w-3 h-3" />
                      抓取到的图片 ({imagePreviews.length} 张)
                      <CheckCircle2 className="w-3 h-3 ml-auto" />
                    </div>
                    <div className="grid grid-cols-3 gap-1 p-1">
                      {imagePreviews.slice(0, 6).map((img, i) => (
                        <img
                          key={i}
                          src={img}
                          alt={`预览 ${i + 1}`}
                          className="w-full aspect-square object-cover rounded"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ))}
                      {imagePreviews.length > 6 && (
                        <div className="w-full aspect-square rounded bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                          +{imagePreviews.length - 6}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Videos */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700 flex items-center">
                    <Video className="w-4 h-4 mr-1.5" />
                    视频链接
                    <span className="text-xs text-gray-400 font-normal ml-1">（可选，支持 YouTube / Bilibili）</span>
                  </label>
                  <button
                    type="button"
                    onClick={addVideo}
                    className="flex items-center gap-1 text-xs text-sky-500 hover:text-sky-600 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加视频
                  </button>
                </div>
                <div className="space-y-2">
                  {videos.length === 0 && (
                    <p className="text-xs text-gray-400 py-2">暂无视频，点击「添加视频」输入 YouTube 或 Bilibili 链接</p>
                  )}
                  {videos.map((vid, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <input
                        type="url"
                        value={vid}
                        onChange={(e) => updateVideo(index, e.target.value)}
                        placeholder="https://youtu.be/... 或 https://www.bilibili.com/video/..."
                        className="flex-1 px-3 py-2 rounded-lg border-2 border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeVideo(index)}
                        className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Post URL & Date */}
              <div className="grid grid-cols-1 gap-4">
                {/* Post URL with fetch button */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-gray-700">
                      原帖链接 <span className="text-xs text-gray-400 font-normal ml-1">（可选）</span>
                    </label>
                    <span className="text-xs text-gray-400">
                      有链接可自动抓取，无链接手动填写即可
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="url"
                        value={postUrl}
                        onChange={(e) => {
                          setPostUrl(e.target.value);
                          if (fetchState === "error") setFetchState("idle");
                        }}
                        onBlur={(e) => handleUrlBlur(e.target.value)}
                        placeholder="有链接可自动抓取，也可以留空手动填写"
                        className={`w-full px-3.5 py-2.5 rounded-xl border-2 transition-all outline-none text-sm ${
                          errors.postUrl
                            ? "border-red-300 bg-red-50"
                            : detectedPlatform
                            ? "border-emerald-300 bg-emerald-50/30"
                            : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                        }`}
                      />
                      {/* 平台识别徽章 */}
                      {detectedPlatform && (
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          {detectedPlatform}
                        </span>
                      )}
                    </div>

                    {/* 抓取按钮 */}
                    <button
                      type="button"
                      onClick={handleFetchPreview}
                      disabled={fetchState === "fetching"}
                      className={`shrink-0 px-3 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
                        fetchState === "fetching"
                          ? "bg-gray-100 text-gray-400 cursor-wait"
                          : fetchState === "done"
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                          : detectedPlatform
                          ? "bg-gradient-to-r from-rose-400 to-sky-500 text-white hover:opacity-90 shadow-sm"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                      title={
                        detectedPlatform
                          ? "从链接自动抓取文案和图片"
                          : "暂不支持该平台自动抓取"
                      }
                    >
                      {fetchState === "fetching" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : fetchState === "done" ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      抓取
                    </button>
                  </div>
                  {errors.postUrl && <p className="text-xs text-red-500 mt-1">{errors.postUrl}</p>}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center">
                    发布时间 <span className="text-red-400 ml-0.5">*</span>
                    {fieldBadge("date")}
                  </label>
                  <input
                    type="datetime-local"
                    value={postDate}
                    onChange={(e) => setPostDate(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl border-2 transition-all outline-none ${
                      errors.postDate
                        ? "border-red-300 bg-red-50"
                        : fetchedFields.has("date")
                        ? "border-emerald-200 bg-emerald-50/30"
                        : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    }`}
                  />
                  {errors.postDate && <p className="text-xs text-red-500 mt-1">{errors.postDate}</p>}
                </div>
              </div>

              {/* Pinned */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-sky-500 focus:ring-sky-200"
                />
                <span className="text-sm text-gray-600">置顶此动态</span>
              </label>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      localStorage.removeItem("hsik_link_preview_cache");
                      localStorage.removeItem("hsik_video_fetch_cache");
                      toast.success("缓存已清除", { description: "请重新抓取链接" });
                    }
                  }}
                  className="py-2.5 px-3 rounded-xl border border-amber-200 text-amber-600 font-medium text-sm hover:bg-amber-50 transition-colors"
                  title="如果抓取结果不正确，点击清除缓存后重试"
                >
                  清除缓存
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-400 to-sky-500 text-white font-medium text-sm hover:opacity-90 transition-opacity shadow-md shadow-sky-200 flex items-center justify-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  {editingPost ? "保存修改" : "添加动态"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
