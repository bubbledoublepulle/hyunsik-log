import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Music, Save, ExternalLink } from "lucide-react";
import type { MusicItem, MusicType, MusicRole } from "@/lib/musicData";

interface MusicFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (item: MusicItem) => void;
  editingItem: MusicItem | null;
}

const musicTypes: MusicType[] = ["团体", "SOLO", "OST", "合作"];
const musicRoles: MusicRole[] = ["演唱", "作曲", "作词", "编曲"];

export default function MusicFormModal({
  open,
  onClose,
  onSave,
  editingItem,
}: MusicFormModalProps) {
  const [title, setTitle] = useState("");
  const [album, setAlbum] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [type, setType] = useState<MusicType>("SOLO");
  const [roles, setRoles] = useState<Set<MusicRole>>(new Set());
  const [link, setLink] = useState("");
  const [isSelfComposed, setIsSelfComposed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editingItem) {
      setTitle(editingItem.title);
      setAlbum(editingItem.album);
      setReleaseDate(editingItem.releaseDate);
      setType(editingItem.type);
      setRoles(new Set(editingItem.roles));
      setLink(editingItem.link);
      setIsSelfComposed(editingItem.isSelfComposed);
    } else {
      setTitle("");
      setAlbum("");
      setReleaseDate("");
      setType("SOLO");
      setRoles(new Set());
      setLink("");
      setIsSelfComposed(false);
    }
    setErrors({});
  }, [editingItem, open]);

  const toggleRole = (role: MusicRole) => {
    const next = new Set(roles);
    if (next.has(role)) {
      next.delete(role);
    } else {
      next.add(role);
    }
    setRoles(next);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "请输入歌曲名称";
    if (!album.trim()) e.album = "请输入专辑名称";
    if (!releaseDate) e.releaseDate = "请选择发行日期";
    if (roles.size === 0) e.roles = "请至少选择一个角色";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    onSave({
      id: editingItem?.id || `m${Date.now()}`,
      title: title.trim(),
      album: album.trim(),
      releaseDate,
      type,
      roles: Array.from(roles),
      plays: "",
      link: link.trim() || "https://music.apple.com",
      isSelfComposed,
    });
  };

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
            <div className="sticky top-0 bg-gradient-to-r from-sky-400 to-sky-600 px-6 py-5 flex items-center justify-between z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
                  <Music className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-lg font-bold text-white">
                  {editingItem ? "编辑歌曲" : "添加歌曲"}
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
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    歌曲名称 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="如: Missing You"
                    className={`w-full px-3.5 py-2.5 rounded-xl border-2 transition-all outline-none ${
                      errors.title
                        ? "border-red-300 bg-red-50"
                        : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    }`}
                  />
                  {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    专辑 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={album}
                    onChange={(e) => setAlbum(e.target.value)}
                    placeholder="专辑名称"
                    className={`w-full px-3.5 py-2.5 rounded-xl border-2 transition-all outline-none ${
                      errors.album
                        ? "border-red-300 bg-red-50"
                        : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    }`}
                  />
                  {errors.album && <p className="text-xs text-red-500 mt-1">{errors.album}</p>}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    发行日期 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={releaseDate}
                    onChange={(e) => setReleaseDate(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl border-2 transition-all outline-none ${
                      errors.releaseDate
                        ? "border-red-300 bg-red-50"
                        : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    }`}
                  />
                  {errors.releaseDate && <p className="text-xs text-red-500 mt-1">{errors.releaseDate}</p>}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    类型 <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as MusicType)}
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all bg-white"
                  >
                    {musicTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Roles */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  角色 <span className="text-red-400">*</span>
                  <span className="text-xs text-gray-400 font-normal ml-1">（可多选）</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {musicRoles.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        roles.has(role)
                          ? "bg-sky-400 text-white border-sky-400"
                          : "bg-white text-gray-500 border-gray-200 hover:border-sky-300"
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
                {errors.roles && <p className="text-xs text-red-500 mt-1">{errors.roles}</p>}
              </div>

              {/* Link */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  平台链接
                </label>
                <div className="relative">
                  <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://music.apple.com/..."
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border-2 border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Self-composed */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-700">自作曲</p>
                  <p className="text-xs text-gray-400">标记为炫植亲自参与创作的作品</p>
                </div>
                <label className="cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelfComposed}
                    onChange={(e) => setIsSelfComposed(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-sky-400 transition-colors relative">
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                      isSelfComposed ? "translate-x-5" : ""
                    }`} />
                  </div>
                </label>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-sky-400 text-white font-medium text-sm hover:bg-sky-500 transition-colors shadow-md shadow-sky-200 flex items-center justify-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  {editingItem ? "保存修改" : "添加歌曲"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
