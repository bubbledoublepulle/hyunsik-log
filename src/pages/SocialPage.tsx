// 图片代理工具函数：使用 images.weserv.nl 全球 CDN，国内可访问
function getProxiedImageUrl(originalUrl: string): string {
  if (!originalUrl) return '';

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
    return `https://images.weserv.nl/?url=${encodeURIComponent(originalUrl)}&n=-1`;
  }

  return originalUrl;
}

import { useState, useMemo, useEffect, useRef } from "react";
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
  Clock,
  Check,
  Replace,
  AlignLeft,
  Loader2,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { fetchLinkPreview, type LinkPreview } from "@/lib/linkPreviewFetcher";
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
import ScrollToTop from "@/components/ScrollToTop";

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

/** 将文本中的 URL 转换为可点击的超链接（无重复） */
function linkifyText(text: string): React.ReactNode[] {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    const url = match[0];
    result.push(
      <a
        key={`link-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sky-500 hover:text-sky-600 hover:underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );
    lastIndex = match.index + url.length;
  }

  if (lastIndex < text.length) {
    result.push(<span key={`text-end`}>{text.slice(lastIndex)}</span>);
  }

  return result;
}

interface TimelineNode {
  year: number;
  months: { month: number; count: number }[];
}

// ===== 批量编辑弹窗 =====
function BatchEditSocialModal({ open, onClose, items, onSave }: {
  open: boolean;
  onClose: () => void;
  items: SocialPost[];
  onSave: (items: SocialPost[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<"content" | "translate">("content");

  // 文案编辑
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [prefixText, setPrefixText] = useState("");
  const [suffixText, setSuffixText] = useState("");

  // AI 翻译
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("hsik_deepseek_key") || "");
  const [targetLang, setTargetLang] = useState("中文");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState({ current: 0, total: 0 });
  const [translations, setTranslations] = useState<Record<string, string>>({});

  const [preview, setPreview] = useState<SocialPost[] | null>(null);

  useEffect(() => {
    if (open) {
      setTranslations({});
      setPreview(null);
    }
  }, [open]);

  const handleTranslate = async () => {
    if (!apiKey.trim()) {
      alert("请输入 DeepSeek API Key");
      return;
    }
    localStorage.setItem("hsik_deepseek_key", apiKey);

    setIsTranslating(true);
    setTranslations({});
    setTranslationProgress({ current: 0, total: items.length });

    const results: Record<string, string> = {};

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setTranslationProgress({ current: i + 1, total: items.length });
            let translated = "";
      let attempts = 0;
      const maxRetries = 2;

      while (attempts <= maxRetries && !translated) {
        try {
          const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "deepseek-chat",
              messages: [
                {
                  role: "system",
                  content: `你是一位专业的韩翻中翻译助手，擅长翻译韩国偶像团体的社交媒体公告、社交平台动态、youtube视频标题

【翻译规则】
1. 所有韩文内容必须完整翻译成中文，不允许遗漏任何文字
2. 保留所有话题标签（#xxx），标签内的韩文可翻译为中文后保留原标签
3. 保留所有@提及和表情符号
4. 保留英文部分（如艺人英文名、节目英文名），主要翻译的艺人为韩国男团BTOB，翻译的成员名字以BTOB成员汉字名为准
5. 节目名称、电台名称等专有名词保留原名，可在括号内加注中文
6. 时间、日期、数字照原文保留
7. 保持原文的换行和分段格式
8."현식시"统一翻译成"炫植时"、"꼬옥"统一翻译成"紧紧拥抱"

【输出要求】
- 只返回翻译后的纯文本
- 不要解释、不要添加"翻译如下"等前缀
- 不要遗漏任何一行内容`,
                },
                {
                  role: "user",
                  content: item.content,
                },
              ],
              temperature: 0.1,
            }),
          });
          const data = await resp.json();
          if (data.choices?.[0]?.message?.content) {
            const raw = data.choices[0].message.content.trim();
            // 如果返回了内容，且和原文不一样，才算成功
            if (raw && raw !== item.content) {
              translated = raw;
            }
          }
        } catch {
          // 网络错误，继续重试
        }
        attempts++;
        if (!translated && attempts <= maxRetries) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

            results[item.id] = translated || item.content;

      if (i < items.length - 1) await new Promise((r) => setTimeout(r, 500));
    }

    setTranslations(results);
    setIsTranslating(false);
  };

  const generatePreview = () => {
    const updated = items.map((item) => {
      let newItem = { ...item };

      if (activeTab === "content") {
        let newContent = item.content;
        if (findText) {
          newContent = newContent.split(findText).join(replaceText);
        }
        if (prefixText) {
          newContent = prefixText + newContent;
        }
        if (suffixText) {
          newContent = newContent + suffixText;
        }
        newItem.content = newContent;
      }

      if (activeTab === "translate") {
        if (translations[item.id]) {
          newItem.content = translations[item.id];
        }
      }

      return newItem;
    });
    setPreview(updated);
  };

  const handleSave = () => {
    if (!preview) return;
    onSave(preview);
    reset();
  };

  const reset = () => {
    setFindText("");
    setReplaceText("");
    setPrefixText("");
    setSuffixText("");
    setTranslations({});
    setPreview(null);
    setActiveTab("content");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const updateTranslation = (id: string, value: string) => {
    setTranslations((prev) => ({ ...prev, [id]: value }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">📝 批量编辑 ({items.length}条)</h2>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex p-1 mx-6 mt-4 bg-gray-100 rounded-xl">
          <button onClick={() => { setActiveTab("content"); setPreview(null); }} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "content" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            <AlignLeft className="w-4 h-4" />文案
          </button>
          <button onClick={() => { setActiveTab("translate"); setPreview(null); }} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "translate" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            <Loader2 className="w-4 h-4" />AI翻译
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {activeTab === "content" && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-sky-50 border border-sky-100">
                <div className="flex items-center gap-2 mb-2">
                  <Replace className="w-4 h-4 text-sky-500" />
                  <span className="text-sm font-medium text-gray-700">查找替换</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={findText} onChange={(e) => setFindText(e.target.value)} placeholder="查找内容" className="px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-sky-400" />
                  <input type="text" value={replaceText} onChange={(e) => setReplaceText(e.target.value)} placeholder="替换为" className="px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-sky-400" />
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="flex items-center gap-2 mb-2">
                  <AlignLeft className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-medium text-gray-700">添加前后缀</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={prefixText} onChange={(e) => setPrefixText(e.target.value)} placeholder="前缀（如 [中字]）" className="px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-emerald-400" />
                  <input type="text" value={suffixText} onChange={(e) => setSuffixText(e.target.value)} placeholder="后缀（如 (精效中字)）" className="px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-emerald-400" />
                </div>
              </div>
            </div>
          )}

          {activeTab === "translate" && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-violet-50 border border-violet-100">
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 className="w-4 h-4 text-violet-500" />
                  <span className="text-sm font-medium text-gray-700">DeepSeek API 设置</span>
                </div>
                <div className="space-y-2">
                                    <input
                    type="password"
                    name="deepseek-api-key"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="输入 DeepSeek API Key（sk-...）"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-violet-400"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">目标语言：</span>
                    <select
                      value={targetLang}
                      onChange={(e) => setTargetLang(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-gray-200 text-sm outline-none focus:border-violet-400 bg-white"
                    >
                      <option value="中文">中文</option>
                      <option value="英文">英文</option>
                      <option value="日文">日文</option>
                      <option value="韩文">韩文</option>
                    </select>
                  </div>
                  <button
                    onClick={handleTranslate}
                    disabled={isTranslating || items.length === 0}
                    className="w-full py-2 rounded-lg bg-violet-400 text-white text-sm font-medium hover:bg-violet-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isTranslating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        翻译中 {translationProgress.current}/{translationProgress.total}
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-4 h-4" />
                        开始翻译
                      </>
                    )}
                  </button>
                </div>
              </div>

              {Object.keys(translations).length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-gray-900">翻译结果（可手动修改）：</p>
                  <div className="border border-gray-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">原文</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">译文</th>
                        </tr>
                      </thead>
                                            <tbody className="divide-y divide-gray-50">
                        {items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2 text-gray-500 align-top">
                              <div className="max-w-[280px] whitespace-pre-wrap break-words text-sm">{item.content}</div>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <textarea
                                value={translations[item.id] || item.content}
                                onChange={(e) => updateTranslation(item.id, e.target.value)}
                                rows={Math.min(Math.max(Math.ceil(item.content.length / 30), 3), 8)}
                                className="w-full px-2 py-1.5 rounded border border-gray-200 text-sm outline-none focus:border-violet-400 resize-y min-h-[60px]"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <button onClick={generatePreview} className="w-full py-2 rounded-xl bg-sky-400 text-white text-sm font-medium hover:bg-sky-500 transition-colors">生成预览</button>

          {preview && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-900">预览变更：</p>
              <div className="border border-gray-100 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">原文案</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">→</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">新文案</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map((item, idx) => (
                      <tr key={item.id}>
                        <td className="px-3 py-1.5 text-gray-500 line-through">{items[idx].content}</td>
                        <td className="px-3 py-1.5 text-gray-300">→</td>
                        <td className="px-3 py-1.5 font-medium text-gray-900">{item.content}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={handleClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors">取消</button>
          <button onClick={handleSave} disabled={!preview} className="px-5 py-2 rounded-xl bg-sky-400 text-white text-sm font-medium hover:bg-sky-500 transition-colors disabled:opacity-50">
            确认保存 {preview ? `(${items.length}条)` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
// ===== 批量编辑弹窗结束 =====
// ===== 批量导入弹窗 =====
function BatchImportSocialModal({ open, onClose, onImport }: {
  open: boolean;
  onClose: () => void;
  onImport: (posts: SocialPost[]) => void;
}) {
  const [category, setCategory] = useState<SocialCategory>("个人动态");
  const [linksText, setLinksText] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<{ success: boolean; url: string; preview?: LinkPreview; error?: string }[]>([]);

  useEffect(() => {
    if (open) {
      setLinksText("");
      setResults([]);
      setProgress({ current: 0, total: 0 });
      setIsFetching(false);
    }
  }, [open]);

  const handleFetch = async () => {
    // ① 提取所有链接
    const rawUrls = linksText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.startsWith("http"));
    
    if (rawUrls.length === 0) {
      toast.error("请输入至少一个有效的链接");
      return;
    }

    // ② 去重：基于 URL 本身（去掉末尾斜杠和查询参数后比较）
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const url of rawUrls) {
      try {
        const u = new URL(url);
        // 去掉末尾斜杠，忽略查询参数（如 tracking_id 等）
        const key = `${u.origin}${u.pathname}`.replace(/\/+$/, "");
        if (!seen.has(key)) {
          seen.add(key);
          urls.push(url); // 保留原始 URL（带查询参数）
        }
      } catch {
        // URL 解析失败，用原始字符串去重
        if (!seen.has(url)) {
          seen.add(url);
          urls.push(url);
        }
      }
    }

    const dupCount = rawUrls.length - urls.length;
    if (dupCount > 0) {
      toast.info(`已剔除 ${dupCount} 条重复链接`);
    }

    setIsFetching(true);
    setProgress({ current: 0, total: urls.length });
    setResults([]);

    const newResults: typeof results = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      setProgress({ current: i + 1, total: urls.length });
      try {
        const preview = await fetchLinkPreview(url);
        newResults.push({ success: true, url, preview });
      } catch (err: any) {
        newResults.push({ success: false, url, error: err.message || "抓取失败" });
      }
      // 间隔 300ms，避免被封
      if (i < urls.length - 1) await new Promise((r) => setTimeout(r, 300));
    }

    setResults(newResults);
    setIsFetching(false);

    const successCount = newResults.filter((r) => r.success).length;
    if (successCount > 0) {
      toast.success(`成功抓取 ${successCount} 条动态`);
    }
    if (successCount < urls.length) {
      toast.error(`${urls.length - successCount} 条链接抓取失败`);
    }
  };

  const handleImport = () => {
    const successResults = results.filter((r) => r.success && r.preview);
    if (successResults.length === 0) {
      toast.error("没有可导入的动态");
      return;
    }

    const posts: SocialPost[] = successResults.map((r, i) => {
      const p = r.preview!;
      return {
        id: `s_${Date.now()}_${i}`,
        category,
        platform: p.platform as SocialPlatform,
        author: p.author || "未知作者",
        content: p.description || "",
        postUrl: p.url,
        postDate: p.date || new Date().toISOString().slice(0, 16),
        images: p.images || [],
        videos: [],
        pinned: false,
      };
    });

    onImport(posts);
    onClose();
  };

  const removeResult = (idx: number) => {
    setResults((prev) => prev.filter((_, i) => i !== idx));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">批量导入社交动态</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {/* 分类选择 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">默认分类</label>
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

          {/* 链接输入 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              链接列表 <span className="text-xs text-gray-400 font-normal">(每行一个)</span>
            </label>
            <textarea
              value={linksText}
              onChange={(e) => setLinksText(e.target.value)}
              placeholder={`https://x.com/xxx/status/123\nhttps://x.com/xxx/status/456\nhttps://www.instagram.com/p/xxx/`}
              rows={6}
              disabled={isFetching}
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all resize-none text-sm"
            />
          </div>

          {/* 开始抓取按钮 */}
          <button
            onClick={handleFetch}
            disabled={isFetching || !linksText.trim()}
            className="w-full py-2.5 rounded-xl bg-sky-400 text-white text-sm font-medium hover:bg-sky-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isFetching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                正在抓取 {progress.current}/{progress.total}
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                开始抓取
              </>
            )}
          </button>

          {/* 结果预览 */}
          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-900">
                抓取结果 ({results.filter((r) => r.success).length}/{results.length} 成功)
              </p>
              <div className="border border-gray-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                {results.map((r, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 ${i > 0 ? "border-t border-gray-50" : ""} ${r.success ? "bg-white" : "bg-red-50/50"}`}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      {r.success ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <X className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {r.success && r.preview ? (
                        <>
                          <p className="text-sm font-medium text-gray-900 line-clamp-1">{r.preview.author || "未知作者"} · {r.preview.platform}</p>
                          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{r.preview.description || "无内容"}</p>
                          {r.preview.images.length > 0 && (
                            <p className="text-[10px] text-gray-400 mt-1">{r.preview.images.length} 张图片</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-red-500">{r.error}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1 truncate">{r.url}</p>
                    </div>
                    <button
                      onClick={() => removeResult(i)}
                      className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors">
            取消
          </button>
          <button
            onClick={handleImport}
            disabled={results.filter((r) => r.success).length === 0}
            className="px-5 py-2 rounded-xl bg-sky-400 text-white text-sm font-medium hover:bg-sky-500 transition-colors disabled:opacity-50"
          >
            确认导入 ({results.filter((r) => r.success).length} 条)
          </button>
        </div>
      </div>
    </div>
  );
}
// ===== 批量导入弹窗结束 =====

export default function SocialPage() {
  const { isAdmin } = useAuth();

  const [socialData, setSocialData] = useState<SocialPost[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<SocialCategory>>(new Set());
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<SocialPlatform>>(new Set());
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

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
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SocialPost | null>(null);
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [detailImageIdx, setDetailImageIdx] = useState(0);

  const [batchEditOpen, setBatchEditOpen] = useState(false);
    const [batchImportOpen, setBatchImportOpen] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  const [batchEditMode, setBatchEditMode] = useState(false);

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

  // 初始加载完成后标记，不再自动监听 socialData 变化保存
  // 保存统一由 handleSave / handleDelete / handleBatchEditSave / handleBatchImport / togglePin 手动触发
  useEffect(() => {
    const timer = setTimeout(() => {
      initialLoadRef.current = false;
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const timelineData = useMemo((): TimelineNode[] => {
    const map = new Map<number, Map<number, number>>();
    socialData.forEach((post) => {
      const date = new Date(post.postDate);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      if (!map.has(year)) map.set(year, new Map());
      const monthMap = map.get(year)!;
      monthMap.set(month, (monthMap.get(month) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, months]) => ({
        year,
        months: Array.from(months.entries())
          .sort((a, b) => b[0] - a[0])
          .map(([month, count]) => ({ month, count })),
      }));
  }, [socialData]);

  const toggleCategory = (cat: SocialCategory) => {
    const next = new Set(selectedCategories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setSelectedCategories(next);
  };

  const togglePlatform = (plat: SocialPlatform) => {
    const next = new Set(selectedPlatforms);
    if (next.has(plat)) next.delete(plat);
    else next.add(plat);
    setSelectedPlatforms(next);
  };

  const handleSelectYear = (year: number) => {
    if (selectedYear === year) {
      setSelectedYear(null);
      setSelectedMonth(null);
    } else {
      setSelectedYear(year);
      setSelectedMonth(null);
    }
  };

  const handleSelectMonth = (year: number, month: number) => {
    if (selectedYear === year && selectedMonth === month) {
      setSelectedYear(null);
      setSelectedMonth(null);
    } else {
      setSelectedYear(year);
      setSelectedMonth(month);
    }
  };

  const clearTimeFilter = () => {
    setSelectedYear(null);
    setSelectedMonth(null);
  };

  const sortedAndFilteredData = useMemo(() => {
    let result = [...socialData];

    if (selectedCategories.size > 0) {
      result = result.filter((post) => post.category && selectedCategories.has(post.category));
    }

    if (selectedPlatforms.size > 0) {
      result = result.filter((post) => selectedPlatforms.has(post.platform));
    }

    if (selectedYear !== null) {
      result = result.filter((post) => new Date(post.postDate).getFullYear() === selectedYear);
    }

    if (selectedMonth !== null && selectedYear !== null) {
      result = result.filter((post) => new Date(post.postDate).getMonth() + 1 === selectedMonth);
    }

    result.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.postDate).getTime() - new Date(a.postDate).getTime();
    });

    return result;
  }, [socialData, selectedCategories, selectedPlatforms, selectedYear, selectedMonth]);

  const toggleBatchSelect = (id: string) => {
    const next = new Set(batchSelectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setBatchSelectedIds(next);
  };

    const handleBatchEditSave = async (updatedItems: SocialPost[]) => {
    userModifiedRef.current = true;
    const newData = socialData.map((item) => {
      const updated = updatedItems.find((u) => u.id === item.id);
      return updated || item;
    });
    setSocialData(newData);
    const { error } = await saveSocialData(newData);
    if (error) {
      toast.error("批量更新同步失败", { description: error });
    } else {
      toast.success(`已批量更新 ${updatedItems.length} 条动态文案`);
    }
    setBatchEditOpen(false);
    setBatchSelectedIds(new Set());
    setBatchEditMode(false);
  };

  const handleBatchImport = async (posts: SocialPost[]) => {
    userModifiedRef.current = true;
    const newData = [...posts, ...socialData];
    setSocialData(newData);
    const { error } = await saveSocialData(newData);
    if (error) {
      toast.error("批量导入同步失败", { description: error });
    } else {
      toast.success(`成功导入 ${posts.length} 条动态`);
    }
    setBatchImportOpen(false);
  };

  const handleAdd = () => {
    setEditingPost(null);
    setFormOpen(true);
  };

  const handleEdit = (post: SocialPost) => {
    setEditingPost(post);
    setFormOpen(true);
  };

  const handleSave = async (post: SocialPost) => {
    userModifiedRef.current = true;
    let newData: SocialPost[];
    if (editingPost) {
      newData = socialData.map((p) => (p.id === post.id ? post : p));
      setSocialData(newData);
      toast.success("动态已更新", { description: post.content.slice(0, 30) + "..." });
    } else {
      newData = [post, ...socialData];
      setSocialData(newData);
      toast.success("动态已添加", { description: post.content.slice(0, 30) + "..." });
    }
    const { error } = await saveSocialData(newData);
    if (error) {
      toast.error("云端同步失败", { description: error });
    }
    setFormOpen(false);
    setEditingPost(null);
  };

  const handleDelete = async (post: SocialPost) => {
    userModifiedRef.current = true;
    const newData = socialData.filter((p) => p.id !== post.id);
    setSocialData(newData);
    const { error } = await saveSocialData(newData);
    if (error) {
      toast.error("删除同步失败", { description: error });
    } else {
      toast.success("动态已删除");
    }
  };

  const togglePin = async (post: SocialPost) => {
    userModifiedRef.current = true;
    const newData = socialData.map((p) =>
      p.id === post.id ? { ...p, pinned: !p.pinned } : p
    );
    setSocialData(newData);
    const { error } = await saveSocialData(newData);
    if (error) {
      toast.error("置顶同步失败", { description: error });
    } else {
      toast.success(post.pinned ? "已取消置顶" : "已置顶", {
        description: post.content.slice(0, 30) + "...",
      });
    }
  };

  const hasTimeFilter = selectedYear !== null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Page toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-rose-400 to-sky-500 text-white text-sm font-bold">
            BTOB · 任炫植
          </div>
          <h1 className="text-2xl font-bold text-gray-900">社交平台动态</h1>
        </div>

        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-400 to-sky-500 text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-md shadow-sky-200 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              添加动态
            </button>
                       
                        <button
              onClick={() => setBatchImportOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-400 text-white text-sm font-medium hover:bg-emerald-500 transition-colors shadow-md shadow-emerald-200 whitespace-nowrap"
            >
              <Link2 className="w-4 h-4" />
              批量导入
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
                  toast.info("批量编辑模式", { description: "点击卡片选择要编辑的动态" });
                }
              }}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-md whitespace-nowrap ${batchEditMode ? "bg-amber-400 text-white hover:bg-amber-500 shadow-amber-200" : "bg-violet-400 text-white hover:bg-violet-500 shadow-violet-200"}`}
            >
              {batchEditMode ? `批量编辑 (${batchSelectedIds.size})` : "批量编辑"}
            </button>
            {batchEditMode && (
              <>
                <button
                  onClick={() => setBatchSelectedIds(new Set(sortedAndFilteredData.map((p) => p.id)))}
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

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left sidebar - Timeline filter */}
        <motion.aside
          initial={{ opacity: 0, x: -15 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full lg:w-56 shrink-0"
        >
          <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-500" />
                <h3 className="font-bold text-gray-900 text-sm">时间轴</h3>
              </div>
              {hasTimeFilter && (
                <button
                  onClick={clearTimeFilter}
                  className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-0.5 transition-colors"
                >
                  <X className="w-3 h-3" />
                  清除
                </button>
              )}
            </div>

            <button
              onClick={clearTimeFilter}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all mb-2 ${
                !hasTimeFilter
                  ? "bg-sky-50 text-sky-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              全部时间
              <span className="ml-1.5 text-xs text-gray-400 font-normal">
                ({socialData.length})
              </span>
            </button>

            <div className="space-y-1">
              {timelineData.map((node) => (
                <div key={node.year}>
                  <button
                    onClick={() => handleSelectYear(node.year)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                      selectedYear === node.year && selectedMonth === null
                        ? "bg-sky-50 text-sky-600"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        selectedYear === node.year && selectedMonth === null
                          ? "bg-sky-400"
                          : "bg-gray-300"
                      }`}
                    />
                    {node.year}年
                    <span className="ml-auto text-xs text-gray-400 font-normal">
                      {node.months.reduce((sum, m) => sum + m.count, 0)}
                    </span>
                  </button>

                  {selectedYear === node.year && (
                    <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-gray-100 pl-3">
                      {node.months.map((m) => (
                        <button
                          key={m.month}
                          onClick={() => handleSelectMonth(node.year, m.month)}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all ${
                            selectedMonth === m.month
                              ? "bg-sky-50 text-sky-600 font-medium"
                              : "text-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              selectedMonth === m.month
                                ? "bg-sky-400"
                                : "bg-gray-200"
                            }`}
                          />
                          {m.month}月
                          <span className="ml-auto text-[10px] text-gray-400">
                            {m.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.aside>

        {/* Right content */}
        <div className="flex-1 min-w-0">
          {/* Filter tags */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 space-y-3">
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
                {selectedCategories.size > 0 || selectedPlatforms.size > 0 || hasTimeFilter
                  ? `分类 ${selectedCategories.size} 个 · 平台 ${selectedPlatforms.size} 个 · ${sortedAndFilteredData.length} 条动态`
                  : `全部 · ${sortedAndFilteredData.length} 条动态`}
              </span>
            </div>
          </div>

          {/* Timeline layout */}
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {sortedAndFilteredData.map((post) => {
                const platformStyle = platformVisualStyles[post.platform];
                const catStyle = post.category ? categoryStyles[post.category] : categoryStyles["个人动态"];
                const isSelected = batchSelectedIds.has(post.id);
                return (
                                    <motion.div
                    key={post.id}
                    id={post.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className={`group relative bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer ${isSelected ? "ring-2 ring-sky-400 ring-offset-2" : ""} ${flashId === post.id ? "flash-highlight" : ""}`}
                    onClick={() => {
                      if (batchEditMode) {
                        toggleBatchSelect(post.id);
                      } else {
                        setSelectedPost(post);
                        setDetailImageIdx(0);
                      }
                    }}
                  >
                    {batchEditMode && (
                      <div className="absolute top-3 left-3 z-20">
                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? "bg-sky-400 border-sky-400" : "bg-white/80 border-gray-300"}`}>
                          {isSelected && <Check className="w-4 h-4 text-white" />}
                        </div>
                      </div>
                    )}

                    <div className="p-4 pb-2">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0" style={batchEditMode ? { marginLeft: "2rem" } : undefined}>
                          <div className={`shrink-0 w-7 h-7 rounded-lg ${platformStyle.bg} ${platformStyle.text} flex items-center justify-center text-xs font-bold`}>
                            {platformStyle.label.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{post.author}</p>
                            <p className="text-[10px] text-gray-400">{platformStyle.label} · {formatRelativeTime(post.postDate)}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {post.pinned && (
                            <div className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                              <Pin className="w-2.5 h-2.5" />置顶
                            </div>
                          )}
                          {isAdmin && !batchEditMode && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={(e) => { e.stopPropagation(); handleEdit(post); }} className="w-6 h-6 rounded-md bg-gray-50 flex items-center justify-center text-gray-500 hover:text-sky-500 hover:bg-sky-50 transition-colors">
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); togglePin(post); }} className="w-6 h-6 rounded-md bg-gray-50 flex items-center justify-center text-gray-500 hover:text-amber-500 hover:bg-amber-50 transition-colors" title={post.pinned ? "取消置顶" : "置顶"}>
                                <Pin className="w-3 h-3" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(post); }} className="w-6 h-6 rounded-md bg-gray-50 flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5" style={batchEditMode ? { marginLeft: "2rem" } : undefined}>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${catStyle.active}`}>{post.category}</span>
                        {post.member && <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${memberColors[post.member as ShowMember]}`}>{post.member}</span>}
                      </div>
                    </div>

                    {post.content && (
                      <div className="px-4 pb-2" style={batchEditMode ? { marginLeft: "2rem" } : undefined}>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap line-clamp-6">{linkifyText(post.content)}</p>
                      </div>
                    )}

                    {post.images.length > 0 && (
                      <div className="px-4 pb-3" style={batchEditMode ? { marginLeft: "2rem" } : undefined}>
                        <ImageGrid images={post.images} />
                      </div>
                    )}

                    {post.videos && post.videos.length > 0 && (
                      <div className="px-4 pb-3 space-y-2" style={batchEditMode ? { marginLeft: "2rem" } : undefined}>
                        {post.videos.map((videoUrl, vi) => {
                          const embed = getVideoEmbedUrl(videoUrl);
                          if (!embed) return null;
                          return (
                            <div key={vi} className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "16/9" }} onClick={(e) => e.stopPropagation()}>
                              <iframe src={embed.src} className="absolute inset-0 w-full h-full" allowFullScreen title={`视频 ${vi + 1}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="px-4 py-3 border-t border-gray-50 flex items-center justify-between gap-2" style={batchEditMode ? { marginLeft: "2rem" } : undefined}>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <span className="flex items-center gap-1"><Calendar className="w-2.5 h-2.5" />{formatAbsoluteTime(post.postDate)}</span>
                      </div>
                      {post.postUrl && (
                        <a href={post.postUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-[10px] text-sky-500 hover:text-sky-600 font-medium transition-colors">
                          <ExternalLink className="w-2.5 h-2.5" />查看原帖
                        </a>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {sortedAndFilteredData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                <MessageSquare className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-sm text-gray-500 mb-1">没有找到匹配的动态</p>
              <p className="text-xs text-gray-400">
                {selectedCategories.size > 0 || selectedPlatforms.size > 0 || hasTimeFilter
                  ? "尝试调整筛选条件或清除筛选"
                  : "管理员可点击「添加动态」创建内容"}
              </p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedPost && (
          <DetailModal post={selectedPost} imageIdx={detailImageIdx} onImageIdxChange={setDetailImageIdx} onClose={() => { setSelectedPost(null); setDetailImageIdx(0); }} />
        )}
      </AnimatePresence>

      <SocialFormModal open={formOpen} onClose={() => { setFormOpen(false); setEditingPost(null); }} onSave={handleSave} editingPost={editingPost} />
      <BatchEditSocialModal open={batchEditOpen} onClose={() => setBatchEditOpen(false)} items={socialData.filter((item) => batchSelectedIds.has(item.id))} onSave={handleBatchEditSave} />
            <BatchImportSocialModal
        open={batchImportOpen}
        onClose={() => setBatchImportOpen(false)}
        onImport={handleBatchImport}
      />
      <DeleteConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && handleDelete(deleteTarget)} title="删除动态" message={`确定要删除这条动态吗？此操作不可撤销。`} />
      <ScrollToTop />
    </div>
  );
}

function DetailModal({ post, imageIdx, onImageIdxChange, onClose }: {
  post: SocialPost;
  imageIdx: number;
  onImageIdxChange: (idx: number) => void;
  onClose: () => void;
}) {
  const platformStyle = platformVisualStyles[post.platform];
  const catStyle = post.category ? categoryStyles[post.category] : categoryStyles["个人动态"];

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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.25 }} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/40 transition-colors">
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 overflow-y-auto">
          {post.images.length > 0 && (
            <div className="relative bg-gray-100">
              <div className="relative" style={{ aspectRatio: post.images.length === 1 ? "auto" : "16/10" }}>
                <img src={getProxiedImageUrl(post.images[imageIdx])} alt={`图片 ${imageIdx + 1}`} className="w-full h-full object-contain max-h-[50vh]" />
                {post.images.length > 1 && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); onImageIdxChange((imageIdx - 1 + post.images.length) % post.images.length); }} className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 transition-colors">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onImageIdxChange((imageIdx + 1) % post.images.length); }} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {post.images.map((_, i) => (
                        <button key={i} onClick={(e) => { e.stopPropagation(); onImageIdxChange(i); }} className={`w-1.5 h-1.5 rounded-full transition-all ${i === imageIdx ? "bg-white w-3" : "bg-white/50"}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {post.videos && post.videos.length > 0 && post.images.length === 0 && (
            <div className="space-y-2 p-4 pb-0">
              {post.videos.map((videoUrl, vi) => {
                const embed = getVideoEmbedUrl(videoUrl);
                if (!embed) return null;
                return <div key={vi} className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}><iframe src={embed.src} className="absolute inset-0 w-full h-full" allowFullScreen title={`视频 ${vi + 1}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" /></div>;
              })}
            </div>
          )}

          <div className="p-6 pt-5">
            <div className="flex items-center gap-3 mb-4">
              <div className={`shrink-0 w-10 h-10 rounded-xl ${platformStyle.bg} ${platformStyle.text} flex items-center justify-center text-sm font-bold`}>{platformStyle.label.charAt(0)}</div>
              <div className="min-w-0">
                <p className="text-base font-bold text-gray-900">{post.author}</p>
                <p className="text-xs text-gray-400">{platformStyle.label} · {formatAbsoluteTime(post.postDate)}{post.pinned && <span className="ml-2 inline-flex items-center gap-0.5 text-amber-600"><Pin className="w-2.5 h-2.5" />置顶</span>}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 mb-4">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${catStyle.active}`}>{post.category}</span>
              {post.member && <span className={`text-xs px-2 py-0.5 rounded border font-medium ${memberColors[post.member as ShowMember]}`}>{post.member}</span>}
            </div>

            {post.content && <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-4">{linkifyText(post.content)}</p>}

            {post.videos && post.videos.length > 0 && post.images.length > 0 && (
              <div className="space-y-2 mb-4">
                {post.videos.map((videoUrl, vi) => {
                  const embed = getVideoEmbedUrl(videoUrl);
                  if (!embed) return null;
                  return <div key={vi} className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}><iframe src={embed.src} className="absolute inset-0 w-full h-full" allowFullScreen title={`视频 ${vi + 1}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" /></div>;
                })}
              </div>
            )}

            {post.postUrl && (
              <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-50 text-sm text-sky-600 hover:bg-sky-50 font-medium transition-colors">
                <ExternalLink className="w-3.5 h-3.5" />查看原帖
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ImageGrid({ images }: { images: string[] }) {
  if (images.length === 0) return null;

  if (images.length === 1) {
    return (
      <div className="rounded-xl overflow-hidden bg-gray-50">
        <img src={getProxiedImageUrl(images[0])} alt="动态图片" loading="lazy" className="w-full h-auto max-h-[500px] object-contain" onError={(e) => { const target = e.currentTarget; target.parentElement!.innerHTML = `<div class="w-full h-40 flex items-center justify-center bg-gray-50 text-gray-300"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg></div>`; }} />
      </div>
    );
  }

  if (images.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
        {images.map((img, i) => <img key={i} src={getProxiedImageUrl(img)} alt={`动态图片 ${i + 1}`} loading="lazy" className="w-full h-48 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />)}
      </div>
    );
  }

  if (images.length === 3) {
    return (
      <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
        <img src={getProxiedImageUrl(images[0])} alt="动态图片 1" loading="lazy" className="w-full h-48 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        <img src={getProxiedImageUrl(images[1])} alt="动态图片 2" loading="lazy" className="w-full h-48 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        <img src={getProxiedImageUrl(images[2])} alt="动态图片 3" loading="lazy" className="w-full h-48 object-cover col-span-2" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
      {images.slice(0, 4).map((img, i) => (
        <div key={i} className="relative">
          <img src={getProxiedImageUrl(img)} alt={`动态图片 ${i + 1}`} loading="lazy" className="w-full h-40 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          {i === 3 && images.length > 4 && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><span className="text-white text-lg font-bold">+{images.length - 4}</span></div>}
        </div>
      ))}
    </div>
  );
}
