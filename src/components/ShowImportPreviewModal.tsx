import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Loader2,
  Link2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  ListPlus,
  Clock,
  Save,
  RotateCcw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import type { ShowItem, ShowMember, ArchiveStatus } from "@/lib/showData";
import { fetchVideoInfo, type VideoInfo } from "@/lib/videoFetcher";
import {
  buildExistingIndex,
  dedupeUrls,
  type DedupeOutcome,
} from "@/lib/urlNormalize";
import { assignBatchIds } from "@/lib/idFactory";
import {
  loadPreviewDraft,
  savePreviewDraft,
  clearPreviewDraft,
} from "@/lib/importQueue";

export type ImportCommitCode = "ok" | "network" | "conflict" | "unknown";

export interface ImportCommitResult {
  ok: boolean;
  code: ImportCommitCode;
  error?: string;
  savedCount?: number;
}

interface ShowImportPreviewModalProps {
  open: boolean;
  onClose: () => void;
  existingItems: ShowItem[];
  onCommit: (items: ShowItem[]) => Promise<ImportCommitResult>;
  onQueue: (items: ShowItem[]) => void;
  onSaved?: (items: ShowItem[]) => void;
}

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

const allStatuses: ArchiveStatus[] = ["已补档", "待补档"];

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

type Step = "input" | "parsing" | "preview" | "saving";

interface ParseResult {
  ok: true;
  item: ShowItem;
}

interface ParseFailure {
  ok: false;
  url: string;
  message: string;
}

function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  return new Promise((resolve, reject) => {
    const results: R[] = new Array(items.length);
    let index = 0;
    let running = 0;
    let settled = 0;
    let rejected = false;

    function next() {
      if (rejected) return;
      if (settled >= items.length) {
        resolve(results);
        return;
      }
      while (running < concurrency && index < items.length) {
        const i = index++;
        running++;
        fn(items[i], i)
          .then((r) => {
            results[i] = r;
          })
          .catch((e) => {
            rejected = true;
            reject(e);
          })
          .finally(() => {
            running--;
            settled++;
            next();
          });
      }
    }

    next();
  });
}

export default function ShowImportPreviewModal({
  open,
  onClose,
  existingItems,
  onCommit,
  onQueue,
  onSaved,
}: ShowImportPreviewModalProps) {
  const [step, setStep] = useState<Step>("input");
  const [batchUrls, setBatchUrls] = useState("");
  const [skipExisting, setSkipExisting] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [previewItems, setPreviewItems] = useState<ShowItem[]>([]);
  const [parseFailures, setParseFailures] = useState<ParseFailure[]>([]);
  const [duplicateRows, setDuplicateRows] = useState<DedupeOutcome["duplicates"]>([]);
  const [unparsableRows, setUnparsableRows] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastError, setLastError] = useState<{ code: ImportCommitCode; message: string } | null>(null);

  const [batchMembers, setBatchMembers] = useState<Set<ShowMember>>(new Set(["BTOB"]));
  const [batchStatus, setBatchStatus] = useState<ArchiveStatus>("待补档");
  const [batchDate, setBatchDate] = useState("");

  const existingIndex = useMemo(() => buildExistingIndex(existingItems), [existingItems]);

  // 恢复草稿
  useEffect(() => {
    if (!open) return;
    const draft = loadPreviewDraft();
    if (draft && draft.items.length > 0) {
      setPreviewItems(draft.items);
      setDuplicateRows(draft.duplicates);
      setSelectedIds(new Set(draft.items.map((i) => i.id)));
      setStep("preview");
      toast.info("恢复上次未确认的导入", { description: `共 ${draft.items.length} 条` });
    } else {
      reset(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reset = (clearDraft = true) => {
    setStep("input");
    setBatchUrls("");
    setProgress({ current: 0, total: 0 });
    setPreviewItems([]);
    setParseFailures([]);
    setDuplicateRows([]);
    setUnparsableRows([]);
    setSelectedIds(new Set());
    setLastError(null);
    setBatchMembers(new Set(["BTOB"]));
    setBatchStatus("待补档");
    setBatchDate("");
    if (clearDraft) clearPreviewDraft();
  };

  const handleClose = () => {
    if (step === "preview" && previewItems.length > 0) {
      savePreviewDraft({
        version: 1,
        createdAt: Date.now(),
        items: previewItems,
        duplicates: duplicateRows,
      });
    }
    onClose();
  };

  const handleParse = async () => {
    const lines = batchUrls
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.error("请先粘贴视频链接");
      return;
    }

    setStep("parsing");
    setProgress({ current: 0, total: lines.length });
    setLastError(null);

    const { fresh, duplicates, unparsable } = dedupeUrls(lines, existingIndex);
    setDuplicateRows(duplicates);
    setUnparsableRows(unparsable);

    const existingByKey = new Map<string, string>();
    for (const [key, id] of existingIndex.entries()) existingByKey.set(key, id);

    const ids = assignBatchIds(
      fresh.map((f) => f.ref),
      new Set(existingItems.map((i) => i.id)),
      existingByKey
    );

    const results = await mapLimit(fresh, 3, async ({ ref, rawUrl }) => {
      try {
        const info: VideoInfo = await fetchVideoInfo(ref.canonicalUrl);
        const grad = gradientPresets[Math.floor(Math.random() * gradientPresets.length)];
        const item: ShowItem = {
          id: ids.get(ref.dedupeKey)!,
          title: info.title || "未识别标题",
          platform: ref.platform === "youtube" ? "YouTube" : "Bilibili",
          date: info.publishedAt || "",
          duration: info.durationFormatted || info.duration || "",
          views: info.viewCountFormatted || "",
          members: ["BTOB"],
          status: "待补档",
          thumbnailFrom: info.thumbnail || grad.from,
          thumbnailTo: grad.to,
          description: "",
          links: [
            {
              platform: ref.platform === "youtube" ? "YouTube" : "Bilibili",
              url: ref.canonicalUrl,
            },
          ],
        };
        return { ok: true as const, item };
      } catch (e: unknown) {
        const err = e as { message?: string; code?: string };
        return {
          ok: false as const,
          url: rawUrl,
          message: err?.message || String(e),
        };
      } finally {
        setProgress((p) => ({ ...p, current: p.current + 1 }));
      }
    });

    const successes = results.filter((r): r is ParseResult => r.ok).map((r) => r.item);
    const failures = results.filter((r): r is ParseFailure => !r.ok);

    setPreviewItems(successes);
    setParseFailures(failures);
    setSelectedIds(new Set(successes.map((i) => i.id)));
    setStep("preview");

    savePreviewDraft({
      version: 1,
      createdAt: Date.now(),
      items: successes,
      duplicates,
    });

    if (successes.length === 0 && failures.length > 0) {
      toast.error("没有成功解析任何视频");
    } else if (failures.length > 0) {
      toast.warning(`成功解析 ${successes.length} 条，失败 ${failures.length} 条`);
    }
  };

  const handleRetryFailed = async () => {
    if (parseFailures.length === 0) return;
    const urls = parseFailures.map((f) => f.url);
    setBatchUrls(urls.join("\n"));
    setParseFailures([]);
    await handleParse();
  };

  const handleConfirm = async () => {
    const items = previewItems.filter((i) => selectedIds.has(i.id));
    if (items.length === 0) {
      toast.error("请至少选择一条要导入的档案");
      return;
    }
    setStep("saving");
    setLastError(null);
    const res = await onCommit(items);
    if (res.ok) {
      clearPreviewDraft();
      reset(false);
      onSaved?.(items);
      toast.success(`已导入 ${res.savedCount ?? items.length} 条档案`);
      onClose();
      return;
    }
    setLastError({ code: res.code, message: res.error ?? "保存失败" });
    setStep("preview");
    toast.error(res.code === "conflict" ? "云端数据已被其他端修改" : "保存失败", {
      description: res.error,
    });
  };

  const handleQueue = () => {
    const items = previewItems.filter((i) => selectedIds.has(i.id));
    if (items.length === 0) {
      toast.error("请至少选择一条要加入队列的档案");
      return;
    }
    onQueue(items);
    clearPreviewDraft();
    reset(false);
    onClose();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => setSelectedIds(new Set(previewItems.map((i) => i.id)));
  const selectNone = () => setSelectedIds(new Set());

  const updateItemField = <K extends keyof ShowItem>(id: string, field: K, value: ShowItem[K]) => {
    setPreviewItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const applyBatchEdit = () => {
    if (selectedIds.size === 0) return;
    setPreviewItems((prev) =>
      prev.map((item) => {
        if (!selectedIds.has(item.id)) return item;
        const updates: Partial<ShowItem> = {};
        if (batchMembers.size > 0) updates.members = Array.from(batchMembers);
        if (batchStatus) updates.status = batchStatus;
        if (batchDate) updates.date = batchDate;
        return { ...item, ...updates };
      })
    );
  };

  const toggleBatchMember = (member: ShowMember) => {
    const next = new Set(batchMembers);
    if (next.has(member)) next.delete(member);
    else next.add(member);
    setBatchMembers(next);
  };

  const selectedCount = selectedIds.size;
  const hasIssues = parseFailures.length > 0 || unparsableRows.length > 0 || duplicateRows.length > 0;

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto scrollbar-thin bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-steel-400 to-steel-500 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
                  <ListPlus className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">批量导入视频档案</h2>
                  <p className={`text-xs ${step === "preview" && hasIssues ? "text-amber-200" : "text-white/80"}`}>
                    {step === "input" && "粘贴 YouTube / Bilibili 链接"}
                    {step === "parsing" && "正在解析链接..."}
                    {step === "preview" && `新增 ${previewItems.length} · 重复 ${duplicateRows.length} · 失败 ${parseFailures.length} · 无法识别 ${unparsableRows.length}`}
                    {step === "saving" && "正在保存..."}
                  </p>
                </div>
              </div>
              <button onClick={handleClose} className="text-white/80 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Step indicator */}
              <div className="flex items-center gap-2 text-xs font-medium text-steel-500/70">
                {[
                  { key: "input", label: "粘贴" },
                  { key: "parsing", label: "解析" },
                  { key: "preview", label: "预览" },
                  { key: "saving", label: "保存" },
                ].map((s, idx, arr) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full ${
                        step === s.key
                          ? "bg-steel-100 text-steel-600"
                          : arr.findIndex((x) => x.key === step) > idx
                          ? "text-steel-400"
                          : "text-steel-300"
                      }`}
                    >
                      {s.label}
                    </span>
                    {idx < arr.length - 1 && <span className="text-steel-200">→</span>}
                  </div>
                ))}
              </div>

              {/* Input */}
              {step === "input" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      <Link2 className="w-4 h-4" />
                      视频链接
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skipExisting}
                        onChange={(e) => setSkipExisting(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      自动跳过已存在的链接
                    </label>
                  </div>
                  <textarea
                    value={batchUrls}
                    onChange={(e) => setBatchUrls(e.target.value)}
                    placeholder={"https://youtu.be/VIDEO_ID\nhttps://www.youtube.com/watch?v=VIDEO_ID\nhttps://www.bilibili.com/video/BV1xx411c7mD\nhttps://b23.tv/BV1xx411c7mD"}
                    rows={8}
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-gray-100 focus:border-steel-400 focus:ring-2 focus:ring-steel-100 outline-none transition-all resize-none text-sm font-mono"
                  />
                  <p className="text-xs text-gray-400">每行一个链接，支持 YouTube / Bilibili / b23.tv 短链。</p>
                  <button
                    onClick={handleParse}
                    disabled={!batchUrls.trim()}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-steel-400 to-steel-500 text-white text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Search className="w-4 h-4" />
                    开始解析
                  </button>
                </div>
              )}

              {/* Parsing */}
              {step === "parsing" && (
                <div className="space-y-3 py-8">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-steel-500" />
                      正在解析 {progress.current} / {progress.total}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-steel-400 to-steel-500 transition-all"
                      style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Preview */}
              {(step === "preview" || (step === "saving" && previewItems.length > 0)) && (
                <div className="space-y-4">
                  {/* Error banner */}
                  {lastError && (
                    <div
                      className={`p-3 rounded-xl border flex items-start gap-2 text-sm ${
                        lastError.code === "conflict"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium">{lastError.message}</p>
                        <div className="flex items-center gap-2 mt-2">
                          {lastError.code === "conflict" ? (
                            <button
                              onClick={handleParse}
                              className="px-3 py-1 rounded-lg bg-amber-100 text-amber-700 text-xs font-medium hover:bg-amber-200 transition-colors flex items-center gap-1"
                            >
                              <RefreshCw className="w-3 h-3" />
                              刷新并重新解析
                            </button>
                          ) : (
                            <button
                              onClick={handleConfirm}
                              className="px-3 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-medium hover:bg-red-200 transition-colors flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              重试
                            </button>
                          )}
                          {lastError.code !== "conflict" && (
                            <button
                              onClick={handleQueue}
                              className="px-3 py-1 rounded-lg bg-steel-100 text-steel-700 text-xs font-medium hover:bg-steel-200 transition-colors"
                            >
                              后台重试
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Batch settings */}
                  {selectedCount > 0 && (
                    <div className="p-3 rounded-xl bg-steel-50/70 border border-steel-200/60 space-y-2">
                      <p className="text-xs font-medium text-steel-600">对选中的 {selectedCount} 条批量设置：</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-gray-500 mb-0.5 block">成员</label>
                          <div className="flex flex-wrap gap-1">
                            {allMembers.map((m) => (
                              <button
                                key={m}
                                onClick={() => toggleBatchMember(m)}
                                className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                                  batchMembers.has(m)
                                    ? "bg-steel-200 border-steel-300 text-steel-800"
                                    : "bg-white border-gray-200 text-gray-600 hover:border-steel-300"
                                }`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-0.5 block">状态</label>
                          <select
                            value={batchStatus}
                            onChange={(e) => setBatchStatus(e.target.value as ArchiveStatus)}
                            className="w-full px-2 py-1 rounded-lg border border-gray-200 text-sm outline-none focus:border-steel-400 bg-white"
                          >
                            {allStatuses.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-0.5 block">日期</label>
                          <input
                            type="date"
                            value={batchDate}
                            onChange={(e) => setBatchDate(e.target.value)}
                            className="w-full px-2 py-1 rounded-lg border border-gray-200 text-sm outline-none focus:border-steel-400"
                          />
                        </div>
                      </div>
                      <button
                        onClick={applyBatchEdit}
                        className="px-3 py-1.5 rounded-lg bg-steel-200 text-steel-800 text-xs font-medium hover:bg-steel-300 transition-colors"
                      >
                        应用到选中的条目
                      </button>
                    </div>
                  )}

                  {/* Preview table */}
                  {previewItems.length > 0 && (
                    <div className="border border-gray-100 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                        <span className="text-xs font-medium text-gray-600">
                          已选择 {selectedCount} / {previewItems.length}
                        </span>
                        <div className="flex items-center gap-2 text-xs">
                          <button onClick={selectAll} className="text-steel-500 hover:text-steel-600 font-medium">
                            全选
                          </button>
                          <span className="text-gray-300">|</span>
                          <button onClick={selectNone} className="text-gray-500 hover:text-gray-600 font-medium">
                            取消全选
                          </button>
                        </div>
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="w-8 px-2 py-2 text-left">
                                <input
                                  type="checkbox"
                                  checked={selectedCount === previewItems.length && previewItems.length > 0}
                                  onChange={(e) => (e.target.checked ? selectAll() : selectNone())}
                                  className="rounded border-gray-300"
                                />
                              </th>
                              <th className="px-2 py-2 text-left font-medium text-gray-600">标题</th>
                              <th className="px-2 py-2 text-left font-medium text-gray-600">平台</th>
                              <th className="px-2 py-2 text-left font-medium text-gray-600">日期</th>
                              <th className="px-2 py-2 text-left font-medium text-gray-600">时长</th>
                              <th className="px-2 py-2 text-left font-medium text-gray-600">播放量</th>
                              <th className="px-2 py-2 text-left font-medium text-gray-600">状态</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {previewItems.map((item) => {
                              const missingDate = !item.date;
                              const missingViews = !item.views;
                              return (
                                <tr
                                  key={item.id}
                                  className={`transition-colors ${
                                    selectedIds.has(item.id) ? "bg-steel-50/50" : "hover:bg-gray-50"
                                  }`}
                                >
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="checkbox"
                                      checked={selectedIds.has(item.id)}
                                      onChange={() => toggleSelect(item.id)}
                                      className="rounded border-gray-300"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="text"
                                      value={item.title}
                                      onChange={(e) => updateItemField(item.id, "title", e.target.value)}
                                      className="w-full px-1.5 py-0.5 rounded border border-transparent hover:border-gray-200 focus:border-steel-400 focus:ring-1 focus:ring-steel-100 text-sm bg-transparent outline-none transition-all"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 text-xs text-gray-500">{item.platform}</td>
                                  <td className="px-2 py-1.5">
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="date"
                                        value={item.date}
                                        onChange={(e) => updateItemField(item.id, "date", e.target.value)}
                                        className="w-full px-1 py-0.5 rounded border border-transparent hover:border-gray-200 focus:border-steel-400 text-xs bg-transparent outline-none transition-all"
                                      />
                                      {missingDate && <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />}
                                    </div>
                                  </td>
                                  <td className="px-2 py-1.5 text-xs text-gray-500">{item.duration || "-"}</td>
                                  <td className="px-2 py-1.5 text-xs text-gray-500">
                                    <div className="flex items-center gap-1">
                                      {item.views || "-"}
                                      {missingViews && <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />}
                                    </div>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <select
                                      value={item.status}
                                      onChange={(e) => updateItemField(item.id, "status", e.target.value as ArchiveStatus)}
                                      className="w-full px-1 py-0.5 rounded border border-transparent hover:border-gray-200 focus:border-steel-400 text-xs bg-transparent outline-none"
                                    >
                                      {allStatuses.map((s) => (
                                        <option key={s} value={s}>
                                          {s}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Duplicates */}
                  {duplicateRows.length > 0 && (
                    <div className="border border-amber-100 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-xs font-medium text-amber-700">
                        <Clock className="w-3.5 h-3.5" />
                        重复项（{duplicateRows.length}）— 默认不导入
                      </div>
                      <div className="max-h-32 overflow-y-auto p-2 space-y-1">
                        {duplicateRows.map((row, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-gray-600">
                            <span className="truncate flex-1">{row.rawUrl}</span>
                            <span className="text-amber-600 shrink-0">已存在: {row.existingShowId}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Failures */}
                  {parseFailures.length > 0 && (
                    <div className="border border-red-100 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-red-50 border-b border-red-100 flex items-center justify-between text-xs font-medium text-red-700">
                        <span className="flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          解析失败（{parseFailures.length}）
                        </span>
                        <button
                          onClick={handleRetryFailed}
                          className="text-red-700 hover:text-red-800 flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          重试失败项
                        </button>
                      </div>
                      <div className="max-h-32 overflow-y-auto p-2 space-y-1">
                        {parseFailures.map((f, idx) => (
                          <div key={idx} className="text-xs text-gray-600">
                            <span className="truncate block text-gray-500">{f.url}</span>
                            <span className="text-red-500">{f.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unparsable */}
                  {unparsableRows.length > 0 && (
                    <div className="border border-gray-100 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-600 flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5" />
                        无法识别（{unparsableRows.length}）
                      </div>
                      <div className="max-h-32 overflow-y-auto p-2 space-y-1">
                        {unparsableRows.map((url, idx) => (
                          <div key={idx} className="text-xs text-gray-500 truncate">
                            {url}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between">
              <button
                onClick={handleClose}
                disabled={step === "saving"}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {step === "preview" ? "稍后继续" : "取消"}
              </button>
              {step === "preview" && (
                <button
                  onClick={handleConfirm}
                  disabled={selectedCount === 0 || !!lastError}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-steel-400 to-steel-500 text-white text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  确认导入 {selectedCount > 0 ? `(${selectedCount})` : ""}
                </button>
              )}
              {step === "input" && (
                <button
                  onClick={handleParse}
                  disabled={!batchUrls.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-steel-400 to-steel-500 text-white text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Search className="w-4 h-4" />
                  开始解析
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
