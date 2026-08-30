import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link2, ImageIcon, Plus, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  socialCategories,
  categoryStyles,
  platformVisualStyles,
  allPlatforms,
  type SocialPost,
  type SocialPlatform,
  type SocialCategory,
} from "@/lib/socialData";
import { memberColors } from "@/lib/showData";
import { fetchSocialPost } from "@/lib/socialFetcher";
import type { ShowMember } from "@/lib/showData";

interface SocialFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (post: SocialPost) => void;
  editingPost: SocialPost | null;
}

const fieldBadge = (field: string) => (
  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600 font-medium">
    {field}
  </span>
);

export default function SocialFormModal({
  open,
  onClose,
  onSave,
  editingPost,
}: SocialFormModalProps) {
  const [category, setCategory] = useState<SocialCategory>("个人动态");
  const [platform, setPlatform] = useState<SocialPlatform>("X");
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [postDate, setPostDate] = useState("");
  const [images, setImages] = useState<string[]>([""]);
  const [videos, setVideos] = useState<string[]>([]);
  const [isSelfComposed, setIsSelfComposed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isFetching, setIsFetching] = useState(false);
  const [fetchedFields, setFetchedFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (editingPost) {
      setCategory(editingPost.category);
      setPlatform(editingPost.platform);
      setAuthor(editingPost.author);
      setContent(editingPost.content);
      setPostUrl(editingPost.postUrl);
      setPostDate(editingPost.postDate);
      setImages(editingPost.images.length > 0 ? [...editingPost.images] : [""]);
      setVideos(editingPost.videos || []);
      setIsSelfComposed(editingPost.isSelfComposed);
    } else {
      setCategory("个人动态");
      setPlatform("X");
      setAuthor("");
      setContent("");
      setPostUrl("");
      setPostDate(new Date().toISOString().slice(0, 16));
      setImages([""]);
      setVideos([]);
      setIsSelfComposed(false);
    }
    setErrors({});
    setFetchedFields(new Set());
  }, [editingPost, open]);

  useEffect(() => {
    if (!postUrl.trim() || editingPost) return;
    const timer = setTimeout(async () => {
      setIsFetching(true);
      try {
        const data = await fetchSocialPost(postUrl);
        if (data) {
          const fields = new Set<string>();
          if (data.content) {
            setContent(data.content);
            fields.add("content");
          }
          if (data.author) {
            setAuthor(data.author);
            fields.add("author");
          }
          if (data.images && data.images.length > 0) {
            setImages(data.images);
            fields.add("images");
          }
          if (data.videos && data.videos.length > 0) {
            setVideos(data.videos);
            fields.add("videos");
          }
          if (data.postDate) {
            const d = new Date(data.postDate);
            if (!isNaN(d.getTime())) {
              setPostDate(d.toISOString().slice(0, 16));
              fields.add("postDate");
            }
          }
          setFetchedFields(fields);
          if (fields.size > 0) {
            toast.success("已自动抓取动态内容", {
              description: `成功获取 ${fields.size} 个字段`,
            });
          }
        }
      } catch {
        // ignore
      } finally {
        setIsFetching(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [postUrl, editingPost]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!author.trim()) e.author = "请输入发布者名称";
    if (!content.trim() && images.filter((i) => i.trim()).length === 0) {
      e.content = "请至少填写文字内容或上传一张图片";
    }
    if (!postDate) e.postDate = "请选择发布时间";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const post: SocialPost = {
      id: editingPost?.id || `s_${Date.now()}`,
      category,
      platform,
      author: author.trim(),
      content: content.trim(),
      postUrl: postUrl.trim(),
      postDate,
      images: images.filter((i) => i.trim()),
      videos: videos.filter((v) => v.trim()),
      isSelfComposed,
      pinned: editingPost?.pinned || false,
    };

    onSave(post);
  };

  const addImage = () => setImages([...images, ""]);
  const removeImage = (idx: number) => setImages(images.filter((_, i) => i !== idx));
  const updateImage = (idx: number, val: string) => {
    const next = [...images];
    next[idx] = val;
    setImages(next);
  };

  const addVideo = () => setVideos([...videos, ""]);
  const removeVideo = (idx: number) => setVideos(videos.filter((_, i) => i !== idx));
  const updateVideo = (idx: number, val: string) => {
    const next = [...videos];
    next[idx] = val;
    setVideos(next);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {editingPost ? "编辑动态" : "添加动态"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {/* Category */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 flex items-center">
              分类标签 <span className="text-red-400 ml-0.5">*</span>
            </label>
            <div className="flex gap-2">
              {socialCategories.map((cat) => {
                const style = categoryStyles[cat.key];
                const isActive = category === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setCategory(cat.key)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      isActive ? style.active : style.inactive
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Platform */}
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

          {/* Author */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center">
              发布者 <span className="text-red-400 ml-0.5">*</span>
              {fieldBadge("author")}
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="例如：@btobcompany"
              className={`w-full px-3.5 py-2.5 rounded-xl border-2 transition-all outline-none ${
                errors.author
                  ? "border-red-300 bg-red-50"
                  : fetchedFields.has("author")
                  ? "border-emerald-200 bg-emerald-50/30"
                  : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              }`}
            />
            {errors.author && (
              <p className="text-xs text-red-500 mt-1">{errors.author}</p>
            )}
          </div>

          {/* Content */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center">
              文字内容
              {fieldBadge("content")}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="输入动态内容...（可留空，但至少填写文字或上传一张图片）"
              rows={4}
              className={`w-full px-3.5 py-2.5 rounded-xl border-2 transition-all outline-none resize-none ${
                errors.content
                  ? "border-red-300 bg-red-50"
                  : fetchedFields.has("content")
                  ? "border-emerald-200 bg-emerald-50/30"
                  : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              }`}
            />
            {errors.content && (
              <p className="text-xs text-red-500 mt-1">{errors.content}</p>
            )}
          </div>

          {/* Post URL */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center">
              原帖链接
              {fieldBadge("postUrl")}
              {isFetching && (
                <span className="ml-2 text-xs text-sky-500 animate-pulse">
                  抓取中...
                </span>
              )}
            </label>
            <div className="relative">
              <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="url"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://x.com/... 或 https://weibo.com/..."
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border-2 transition-all outline-none ${
                  fetchedFields.has("postUrl")
                    ? "border-emerald-200 bg-emerald-50/30"
                    : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                }`}
              />
            </div>
          </div>

          {/* Images */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center">
              图片链接
              <span className="text-xs text-gray-400 ml-1.5 font-normal">
                (可选)
              </span>
              {fieldBadge("images")}
            </label>
            <div className="space-y-2">
              <AnimatePresence>
                {images.map((img, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex gap-2"
                  >
                    <div className="relative flex-1">
                      <ImageIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="url"
                        value={img}
                        onChange={(e) => updateImage(idx, e.target.value)}
                        placeholder="图片 URL"
                        className={`w-full pl-10 pr-4 py-2.5 rounded-xl border-2 transition-all outline-none ${
                          fetchedFields.has("images")
                            ? "border-emerald-200 bg-emerald-50/30"
                            : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                        }`}
                      />
                    </div>
                    {images.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              <button
                type="button"
                onClick={addImage}
                className="flex items-center gap-1.5 text-sm text-sky-500 hover:text-sky-600 font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                添加图片
              </button>
            </div>
          </div>

          {/* Videos */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center">
              视频链接
              <span className="text-xs text-gray-400 ml-1.5 font-normal">
                (可选)
              </span>
              {fieldBadge("videos")}
            </label>
            <div className="space-y-2">
              <AnimatePresence>
                {videos.map((vid, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex gap-2"
                  >
                    <input
                      type="url"
                      value={vid}
                      onChange={(e) => updateVideo(idx, e.target.value)}
                      placeholder="YouTube 或 Bilibili 链接"
                      className="flex-1 px-3.5 py-2.5 rounded-xl border-2 border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => removeVideo(idx)}
                      className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
              <button
                type="button"
                onClick={addVideo}
                className="flex items-center gap-1.5 text-sm text-sky-500 hover:text-sky-600 font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                添加视频
              </button>
            </div>
          </div>

          {/* Post Date */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center">
              发布时间 <span className="text-red-400 ml-0.5">*</span>
              {fieldBadge("postDate")}
            </label>
            <input
              type="datetime-local"
              value={postDate}
              onChange={(e) => setPostDate(e.target.value)}
              className={`w-full px-3.5 py-2.5 rounded-xl border-2 transition-all outline-none ${
                errors.postDate
                  ? "border-red-300 bg-red-50"
                  : fetchedFields.has("postDate")
                  ? "border-emerald-200 bg-emerald-50/30"
                  : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              }`}
            />
            {errors.postDate && (
              <p className="text-xs text-red-500 mt-1">{errors.postDate}</p>
            )}
          </div>

          {/* Self-composed toggle */}
          <div className="pt-2 border-t border-gray-50">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-600 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-sky-400" />
                标记为自作曲相关
              </span>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={isSelfComposed}
                  onChange={(e) => setIsSelfComposed(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="w-9 h-5 bg-gray-200 rounded-full peer-checked:bg-sky-400 transition-colors" />
                <div
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                    isSelfComposed ? "translate-x-4" : ""
                  }`}
                />
              </div>
            </label>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 rounded-xl bg-sky-400 text-white text-sm font-medium hover:bg-sky-500 transition-colors"
          >
            {editingPost ? "保存修改" : "添加动态"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
