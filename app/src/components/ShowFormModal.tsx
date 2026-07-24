import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Tv, Save, Plus, Trash2, Link2, Search, Loader2, CheckCircle2,
  Image as ImageIcon, AlertTriangle, ListPlus, FileText,
} from "lucide-react";
import { toast } from "sonner";
import type { ShowItem, ShowMember, VideoLink } from "@/lib/showData";
import { detectPlatform, fetchVideoInfo, type VideoInfo, type FetchError } from "@/lib/videoFetcher";
import { useShowSync } from "@/hooks/useShowSync";

interface ShowFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (item: ShowItem) => void | Promise<void>;
  editingItem: ShowItem | null;
}

const allMembers: ShowMember[] = [
  "任炫植", "徐恩光", "李旼赫", "李昌燮", "Peniel", "陆星材", "全体",
];

const platforms = ["Mnet", "JTBC", "MBC", "NAVER NOW", "V LIVE", "Weverse", "YouTube", "其他"];
const linkPlatforms = ["YouTube", "Bilibili", "V LIVE", "Weverse", "NAVER NOW", "其他"];

const gradientPresets = [
  { from: "#42B4E6", to: "#1A5A7A" },
  { from: "#667EEA", to: "#764BA2" },
  { from: "#F093FB", to: "#F5576C" },
  { from: "#4FAC50", to: "#00BBF9" },
  { from: "#FA709A", to: "#FEE140" },
  { from: "#30CFD0", to: "#330867" },
  { from: "#A8EDEA", to: "#FED6E3" },
  { from: "#667EEA", to: "#00D2FF" },
];

type FetchState = "idle" | "fetching" | "done" | "error";

export default function ShowFormModal({
  open, onClose, onSave, editingItem,
}: ShowFormModalProps) {
  useShowSync(() => {
    setTitle(loadShowData());
  });
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("Mnet");
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState("");
  const [views, setViews] = useState("");
  const [members, setMembers] = useState<Set<ShowMember>>(new Set());
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState<VideoLink[]>([{ platform: "YouTube", url: "" }]);
  const [gradientIdx, setGradientIdx] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 批量导入模式
  const [batchMode, setBatchMode] = useState(false);
  const [batchUrls, setBatchUrls] = useState("");
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [batchResults, setBatchResults] = useState<ShowItem[]>([]);

  // 自动抓取状态
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [fetchedFields, setFetchedFields] = useState<Set<string>>(new Set());
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [detectedPlatform, setDetectedPlatform] = useState<"youtube" | "bilibili" | null>(null);
  const [fetchErrorMsg, setFetchErrorMsg] = useState<string>("");
  const [autoFetchEnabled, setAutoFetchEnabled] = useState(true); // 粘贴后自动抓取开关

  // 初始化 / 重置表单
  useEffect(() => {
    if (editingItem) {
      setTitle(editingItem.title);
      setPlatform(editingItem.platform);
      setDate(editingItem.date);
      setDuration(editingItem.duration);
      setViews(editingItem.views);
      setMembers(new Set(editingItem.members));
      setDescription(editingItem.description);
      if (editingItem.links && editingItem.links.length > 0) {
        setLinks(editingItem.links.map((l) => ({ ...l })));
      } else if (editingItem.link) {
        let p = "YouTube";
        if (editingItem.link.includes("bilibili.com")) p = "Bilibili";
        else if (editingItem.link.includes("vlive.tv")) p = "V LIVE";
        else if (editingItem.link.includes("weverse.io")) p = "Weverse";
        setLinks([{ platform: p, url: editingItem.link }]);
      } else {
        setLinks([{ platform: "YouTube", url: "" }]);
      }
      const idx = gradientPresets.findIndex(
        (g) => g.from === editingItem.thumbnailFrom && g.to === editingItem.thumbnailTo
      );
      setGradientIdx(idx >= 0 ? idx : 0);
    } else {
      setTitle("");
      setPlatform("Mnet");
      setDate("");
      setDuration("");
      setViews("");
      setMembers(new Set());
      setDescription("");
      setLinks([{ platform: "YouTube", url: "" }]);
      setGradientIdx(Math.floor(Math.random() * gradientPresets.length));
    }
    // 重置抓取状态
    setFetchState("idle");
    setFetchedFields(new Set());
    setThumbnailPreview(null);
    setDetectedPlatform(null);
    setFetchErrorMsg("");
    setErrors({});
  }, [editingItem, open]);

  const toggleMember = (member: ShowMember) => {
    const next = new Set(members);
    next.has(member) ? next.delete(member) : next.add(member);
    setMembers(next);
  };

  // ========== 粘贴自动抓取（去抖 1.5 秒） ==========
  useEffect(() => {
    if (!autoFetchEnabled) return;
    if (fetchState === "fetching") return;

    // 找一个已识别平台但字段为空的链接
    const targetIdx = links.findIndex((l) => {
      const u = l.url.trim();
      if (!u) return false;
      const d = detectPlatform(u);
      return d !== "unknown" && !title && !date && !duration && !views;
    });

    if (targetIdx < 0) return;

    const timer = setTimeout(() => {
      handleFetch(targetIdx);
    }, 1500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, autoFetchEnabled]);

  const addLink = () => setLinks([...links, { platform: "Bilibili", url: "" }]);

  const removeLink = (index: number) => {
    if (links.length > 1) setLinks(links.filter((_, i) => i !== index));
  };

  const updateLink = (index: number, field: "platform" | "url", value: string) => {
    const next = [...links];
    next[index] = { ...next[index], [field]: value };
    setLinks(next);
  };

  // ========== URL 自动识别 ==========

  /** URL 输入框失焦时自动识别平台 */
  function handleUrlBlur(index: number, url: string) {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setDetectedPlatform(null);
      setFetchErrorMsg("");
      return;
    }
    const detected = detectPlatform(cleanUrl);
    if (detected === "unknown") {
      setDetectedPlatform(null);
      setFetchErrorMsg("该平台暂不支持自动抓取");
    } else {
      setDetectedPlatform(detected);
      setFetchErrorMsg("");
      // 自动选中对应平台的 link dropdown
      const linkPlatform = detected === "youtube" ? "YouTube" : "Bilibili";
      updateLink(index, "platform", linkPlatform);
      // 如果是新建且未设置平台，也更新主体 platform
      if (!editingItem && !platform) {
        setPlatform(linkPlatform);
      }
    }
    // 重新触发 fetch 按钮状态
    if (fetchState === "error") setFetchState("idle");
  }

  // ========== 自动抓取 ==========

  async function handleFetch(index: number) {
    // 优先找 YouTube 链接，其次 Bilibili，最后用当前点击的链接
    const youtubeLink = links.find(l => detectPlatform(l.url.trim()) === "youtube");
    const bilibiliLink = links.find(l => detectPlatform(l.url.trim()) === "bilibili");
    const targetLink = youtubeLink || bilibiliLink || links[index];
    const url = targetLink?.url?.trim();
    
    if (!url) {
      toast.error("请先填写视频链接");
      return;
    }

    const detected = detectPlatform(url);
    if (detected === "unknown") {
      toast.error("该平台暂不支持自动抓取，请手动填写");
      return;
    }

    setFetchState("fetching");
    setFetchErrorMsg("");
    setThumbnailPreview(null);

    try {
      const info: VideoInfo = await fetchVideoInfo(url);

      // 自动填充所有字段
      const filled: Set<string> = new Set();

      if (info.title) {
        setTitle(info.title);
        filled.add("title");
      }
      if (info.publishedAt) {
        setDate(info.publishedAt);
        filled.add("date");
      }
      if (info.durationFormatted || info.duration) {
        setDuration(info.durationFormatted || info.duration);
        filled.add("duration");
      }
      if (info.viewCountFormatted) {
        setViews(info.viewCountFormatted);
        filled.add("views");
      }
      if (info.thumbnail) {
        setThumbnailPreview(info.thumbnail);
      }

      // 平台自动匹配
      const linkPlatform = detected === "youtube" ? "YouTube" : "Bilibili";
      updateLink(index, "platform", linkPlatform);
      if (!editingItem) {
        setPlatform(linkPlatform);
        filled.add("platform");
      }

      setFetchedFields(filled);
      setFetchState("done");
      setFetchErrorMsg("");

      // 根据抓取完整度显示不同提示
      const hasViews = !!info.viewCountFormatted;
      const hasDate = !!info.publishedAt;
      if (!hasViews || !hasDate) {
        toast.warning(`已自动填充标题和封面，播放量/日期需手动填写`, {
          description: `点击下方「查看视频」打开 YouTube 页面查看数据`,
        });
      } else {
        toast.success(`已从 ${info.platform === "youtube" ? "YouTube" : "Bilibili"} 抓取 ${filled.size} 项数据`, {
          description: "可手动修改任何字段后保存",
        });
      }
    } catch (e: unknown) {
      const err = e as FetchError;
      let msg = "数据抓取失败";
      if (err?.code === "unsupported") {
        msg = "该平台暂不支持自动抓取";
      } else if (err?.code === "not-found") {
        msg = "视频不存在或已删除";
      } else if (err?.code === "quota-exceeded") {
        msg = "已达到 API 调用限额";
      } else if (err?.code === "api-error" || err?.code === "network") {
        msg = "API 调用失败，请稍后重试";
      }
      setFetchErrorMsg(msg);
      setFetchState("error");
      toast.error(msg, {
        description: "请检查链接是否正确，或手动填写信息",
      });
    }
  }

  // ========== 批量导入 ==========

  async function handleBatchImport() {
    const lines = batchUrls.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      toast.error("请先粘贴视频链接");
      return;
    }

    setBatchProgress({ current: 0, total: lines.length, success: 0, failed: 0 });
    setFetchState("fetching");
    const results: ShowItem[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const url = lines[i];
      setBatchProgress({ current: i + 1, total: lines.length, success: successCount, failed: failedCount });

      try {
        const info = await fetchVideoInfo(url);
        const detected = detectPlatform(url);
        const linkPlatform = detected === "youtube" ? "YouTube" : detected === "bilibili" ? "Bilibili" : "其他";
        const grad = gradientPresets[Math.floor(Math.random() * gradientPresets.length)];

        const item: ShowItem = {
          id: `s${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: info.title || "未识别标题",
          platform: linkPlatform,
          date: info.publishedAt || new Date().toISOString().split("T")[0],
          duration: info.duration || "",
          views: info.viewCountFormatted || "",
          members: ["全体"],
          status: "待补档",
          thumbnailFrom: grad.from,
          thumbnailTo: grad.to,
          description: "",
          links: [{ platform: linkPlatform, url }],
        };

        results.push(item);
        successCount++;
        setBatchProgress({ current: i + 1, total: lines.length, success: successCount, failed: failedCount });
      } catch (e: unknown) {
        failedCount++;
        setBatchProgress({ current: i + 1, total: lines.length, success: successCount, failed: failedCount });
        toast.error(`解析失败: ${url.slice(0, 50)}...`, {
          description: (e as FetchError)?.message || "无法识别该链接",
        });
      }

      if (i < lines.length - 1) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    setBatchResults(results);
    setFetchState(results.length > 0 ? "done" : "error");

    if (results.length > 0) {
      toast.success(`成功导入 ${results.length} 条视频`, {
        description: failedCount > 0 ? `${failedCount} 条解析失败，可手动添加` : "点击下方「全部保存」添加到档案",
      });
    } else {
      toast.error("没有成功解析任何视频，请检查链接格式");
    }
  }

  async function saveAllBatch() {
    for (const item of batchResults) {
      await Promise.resolve(onSave(item));
      await new Promise((r) => setTimeout(r, 100));
    }
    setBatchMode(false);
    setBatchUrls("");
    setBatchResults([]);
    setFetchState("idle");
    toast.success(`已保存 ${batchResults.length} 条综艺档案`);
  }

  // ========== 表单验证 ==========

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "请输入综艺标题（可先填写链接后点击「自动抓取」）";
    if (!date) e.date = "请选择日期";
    if (!duration.trim()) e.duration = "请输入时长";
    if (!views.trim()) e.views = "请输入播放量";
    if (members.size === 0) e.members = "请至少选择一位成员";
    const validLinks = links.filter((l) => l.url.trim());
    if (validLinks.length === 0) e.links = "请至少填写一个平台链接";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (batchMode && batchResults.length > 0) {
      saveAllBatch();
      return;
    }
    if (!validate()) return;

    const grad = gradientPresets[gradientIdx];
    const validLinks = links
      .filter((l) => l.url.trim())
      .map((l) => ({ platform: l.platform, url: l.url.trim() }));

    onSave({
      id: editingItem?.id || `s${Date.now()}`,
      title: title.trim(),
      platform,
      date,
      duration: duration.trim(),
      views: views.trim(),
      members: Array.from(members),
      status: "已补档",
      thumbnailFrom: grad.from,
      thumbnailTo: grad.to,
      description: description.trim(),
      links: validLinks,
    });
  };;

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
            <div className="sticky top-0 bg-gradient-to-r from-violet-400 to-sky-500 px-6 py-5 flex items-center justify-between z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
                  <Tv className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-lg font-bold text-white">
                  {editingItem ? "编辑综艺" : "添加综艺"}
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
              {/* ====== 模式切换 ====== */}
              {!editingItem && (
                <div className="flex p-1 bg-gray-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => { setBatchMode(false); setFetchState("idle"); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      !batchMode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    单条添加
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBatchMode(true); setFetchState("idle"); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      batchMode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                    }`}
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                    批量导入
                  </button>
                </div>
              )}

              {/* ====== 批量导入模式 ====== */}
              {batchMode && !editingItem && (
                <div className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      <FileText className="w-4 h-4" />
                      批量粘贴链接
                    </label>
                    <span className="text-xs text-gray-400">每行一个链接</span>
                  </div>
                  <textarea
                    value={batchUrls}
                    onChange={(e) => setBatchUrls(e.target.value)}
                    placeholder={"https://youtu.be/VIDEO_ID1\nhttps://www.youtube.com/live/VIDEO_ID2\nhttps://www.bilibili.com/video/BV1xx411c7mD"}
                    rows={6}
                    disabled={fetchState === "fetching"}
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all resize-none text-sm font-mono"
                  />

                  {fetchState === "fetching" && batchProgress.total > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">
                          正在解析 {batchProgress.current} / {batchProgress.total}
                        </span>
                        <span className="text-emerald-600">
                          成功 {batchProgress.success} · 失败 {batchProgress.failed}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-sky-400 to-violet-400 transition-all"
                          style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {batchResults.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-700">解析结果预览：</p>
                      <div className="max-h-40 overflow-y-auto space-y-1.5">
                        {batchResults.map((item, i) => (
                          <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-100 text-xs">
                            <span className="text-gray-400 w-5 shrink-0">{i + 1}</span>
                            <span className="truncate flex-1 font-medium text-gray-700">{item.title}</span>
                            <span className="text-gray-400 shrink-0">{item.platform}</span>
                            {item.date && <span className="text-blue-500 shrink-0">{item.date}</span>}
                            {item.views && <span className="text-emerald-600 shrink-0">{item.views}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleBatchImport}
                    disabled={fetchState === "fetching" || !batchUrls.trim()}
                    className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                      fetchState === "fetching"
                        ? "bg-gray-100 text-gray-400 cursor-wait"
                        : batchResults.length > 0
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                        : "bg-gradient-to-r from-sky-400 to-violet-400 text-white hover:opacity-90 shadow-sm"
                    }`}
                  >
                    {fetchState === "fetching" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : batchResults.length > 0 ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    {fetchState === "fetching"
                      ? "解析中..."
                      : batchResults.length > 0
                      ? "重新解析"
                      : "开始批量解析"}
                  </button>
                </div>
              )}

              {/* ====== 单条添加模式 ====== */}
              {!batchMode && (
              <div>
              {/* ====== 平台链接（核心输入区） ====== */}
              <div className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Link2 className="w-4 h-4" />
                    原链接 URL <span className="text-red-400">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    {/* 自动抓取开关 */}
                    <button
                      type="button"
                      onClick={() => setAutoFetchEnabled(!autoFetchEnabled)}
                      className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                        autoFetchEnabled
                          ? "text-sky-500"
                          : "text-gray-400 hover:text-gray-500"
                      }`}
                      title={autoFetchEnabled ? "点击关闭自动抓取" : "点击开启自动抓取"}
                    >
                      <span className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                        autoFetchEnabled ? "bg-sky-400" : "bg-gray-200"
                      }`}>
                        <span className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transform ring-0 transition-transform ${
                          autoFetchEnabled ? "translate-x-3" : "translate-x-0"
                        }`} />
                      </span>
                      自动抓取
                    </button>
                    <button
                      type="button"
                      onClick={addLink}
                      className="flex items-center gap-1 text-xs text-sky-500 hover:text-sky-600 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      添加链接
                    </button>
                  </div>
                </div>

                <p className="text-xs text-gray-400 mb-3">
                  {autoFetchEnabled
                    ? "粘贴 YouTube / Bilibili 链接后将自动抓取标题、封面、播放量等信息"
                    : "粘贴 YouTube 或 Bilibili 链接后，点击「抓取」一键填充下方所有信息"}
                </p>

                <div className="space-y-2">
                  {links.map((link, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      {/* 平台选择 */}
                      <select
                        value={link.platform}
                        onChange={(e) => updateLink(index, "platform", e.target.value)}
                        className="w-28 shrink-0 px-2.5 py-2.5 rounded-xl border-2 border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all bg-white text-sm"
                      >
                        {linkPlatforms.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>

                      {/* URL 输入 + 抓取按钮 */}
                      <div className="flex-1 flex gap-2">
                        <div className="flex-1 relative">
                          <input
                            type="url"
                            value={link.url}
                            onChange={(e) => {
                              updateLink(index, "url", e.target.value);
                              // 清除之前的错误状态
                              if (fetchState === "error") setFetchState("idle");
                              if (fetchErrorMsg) setFetchErrorMsg("");
                            }}
                            onBlur={(e) => handleUrlBlur(index, e.target.value)}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all outline-none text-sm ${
                              detectedPlatform
                                ? "border-emerald-300 bg-emerald-50/30"
                                : fetchErrorMsg
                                ? "border-amber-300 bg-amber-50/30"
                                : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                            }`}
                          />
                          {/* 平台识别指示器 */}
                          {detectedPlatform && (
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              {detectedPlatform === "youtube" ? "YouTube" : "Bilibili"}
                            </span>
                          )}
                          {fetchErrorMsg && !detectedPlatform && (
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              无法识别
                            </span>
                          )}
                        </div>

                        {/* 自动抓取按钮 */}
                        {link.url.trim() && (
                          <button
                            type="button"
                            onClick={() => handleFetch(index)}
                            disabled={fetchState === "fetching"}
                            className={`shrink-0 px-3 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
                              fetchState === "fetching"
                                ? "bg-gray-100 text-gray-400 cursor-wait"
                                : fetchState === "done"
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                : detectedPlatform
                                ? "bg-gradient-to-r from-sky-400 to-violet-400 text-white hover:opacity-90 shadow-sm"
                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                            }`}
                            title={
                              detectedPlatform
                                ? "从链接自动抓取视频信息"
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
                        )}

                        {links.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLink(index)}
                            className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 错误信息 */}
                {fetchErrorMsg && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {fetchErrorMsg}
                  </p>
                )}
                {errors.links && <p className="text-xs text-red-500 mt-2">{errors.links}</p>}

                {/* 查看视频链接（部分抓取时提示手动填写） */}
                {fetchState === "done" && detectedPlatform === "youtube" && links[0]?.url && (
                  <a
                    href={links[0].url.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-sky-500 hover:text-sky-600 font-medium mt-1"
                  >
                    <Link2 className="w-3 h-3" />
                    查看视频页面（复制播放量和日期）
                  </a>
                )}

                {/* 封面预览 */}
                {thumbnailPreview && (
                  <div className="mt-3 rounded-xl overflow-hidden border-2 border-emerald-200">
                    <div className="bg-emerald-50 px-3 py-1.5 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <ImageIcon className="w-3 h-3" />
                      封面预览
                      <CheckCircle2 className="w-3 h-3 ml-auto" />
                    </div>
                    <img
                      src={thumbnailPreview}
                      alt="视频封面预览"
                      className="w-full aspect-video object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
              </div>

              {/* ====== 视频信息（自动填充区） ====== */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center">
                  综艺标题 <span className="text-red-400 ml-0.5">*</span>
                  {fieldBadge("title")}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="如: BTOB的卡拉OK出击"
                  className={`w-full px-3.5 py-2.5 rounded-xl border-2 transition-all outline-none ${
                    errors.title
                      ? "border-red-300 bg-red-50"
                      : fetchedFields.has("title")
                      ? "border-emerald-200 bg-emerald-50/30"
                      : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  }`}
                />
                {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center">
                    平台
                    {fieldBadge("platform")}
                  </label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all bg-white"
                  >
                    {platforms.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center">
                    日期 <span className="text-red-400 ml-0.5">*</span>
                    {fieldBadge("date")}
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl border-2 transition-all outline-none ${
                      errors.date
                        ? "border-red-300 bg-red-50"
                        : fetchedFields.has("date")
                        ? "border-emerald-200 bg-emerald-50/30"
                        : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    }`}
                  />
                  {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center">
                    时长 <span className="text-red-400 ml-0.5">*</span>
                    {fieldBadge("duration")}
                  </label>
                  <input
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="如: 1小时15分"
                    className={`w-full px-3.5 py-2.5 rounded-xl border-2 transition-all outline-none ${
                      errors.duration
                        ? "border-red-300 bg-red-50"
                        : fetchedFields.has("duration")
                        ? "border-emerald-200 bg-emerald-50/30"
                        : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    }`}
                  />
                  {errors.duration && <p className="text-xs text-red-500 mt-1">{errors.duration}</p>}
                </div>

                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center">
                    播放量 <span className="text-red-400 ml-0.5">*</span>
                    {fieldBadge("views")}
                  </label>
                  <input
                    type="text"
                    value={views}
                    onChange={(e) => setViews(e.target.value)}
                    placeholder="如: 280万"
                    className={`w-full px-3.5 py-2.5 rounded-xl border-2 transition-all outline-none ${
                      errors.views
                        ? "border-red-300 bg-red-50"
                        : fetchedFields.has("views")
                        ? "border-emerald-200 bg-emerald-50/30"
                        : "border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    }`}
                  />
                  {errors.views && <p className="text-xs text-red-500 mt-1">{errors.views}</p>}
                </div>
              </div>

              {/* Members */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  出演成员 <span className="text-red-400">*</span>
                  <span className="text-xs text-gray-400 font-normal ml-1">（可多选）</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {allMembers.map((member) => (
                    <button
                      key={member}
                      type="button"
                      onClick={() => toggleMember(member)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        members.has(member)
                          ? "bg-sky-400 text-white border-sky-400"
                          : "bg-white text-gray-500 border-gray-200 hover:border-sky-300"
                      }`}
                    >
                      {member}
                    </button>
                  ))}
                </div>
                {errors.members && <p className="text-xs text-red-500 mt-1">{errors.members}</p>}
              </div>

              {/* Cover gradient */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  封面渐变
                  <span className="text-xs text-gray-400 font-normal ml-1">
                    （无抓取封面时使用的手动备用封面）
                  </span>
                </label>
                <div className="grid grid-cols-8 gap-2">
                  {gradientPresets.map((g, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setGradientIdx(i)}
                      className={`aspect-[5/4] rounded-lg transition-all ${
                        gradientIdx === i
                          ? "ring-2 ring-offset-2 ring-sky-400 scale-105"
                          : "hover:scale-105"
                      }`}
                      style={{ background: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
                    />
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">描述</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="节目简介..."
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all resize-none"
                />
              </div>

              </div>
              )}

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
                  disabled={fetchState === "fetching" || (batchMode && batchResults.length === 0)}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-400 to-sky-500 text-white font-medium text-sm hover:opacity-90 transition-opacity shadow-md shadow-sky-200 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {editingItem ? "保存修改" : batchMode ? `保存全部 (${batchResults.length})` : "添加综艺"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
