import { useState, useEffect } from "react";
import { X, Users, Type, Replace, UserPlus, UserMinus, Loader2, Languages, KeyRound } from "lucide-react";
import type { ShowItem, ShowMember } from "@/lib/showData";

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

const LANGUAGES = [
  { key: "中文", label: "中文" },
  { key: "英文", label: "英文" },
  { key: "日文", label: "日文" },
  { key: "韩文", label: "韩文" },
];

interface BatchEditShowsModalProps {
  open: boolean;
  onClose: () => void;
  items: ShowItem[];
  onSave: (items: ShowItem[]) => void;
}

export default function BatchEditShowsModal({ open, onClose, items, onSave }: BatchEditShowsModalProps) {
  const [activeTab, setActiveTab] = useState<"title" | "members" | "translate">("title");

  // 标题编辑
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [prefixText, setPrefixText] = useState("");
  const [suffixText, setSuffixText] = useState("");

  // 成员编辑
  const [membersToAdd, setMembersToAdd] = useState<Set<ShowMember>>(new Set());
  const [membersToRemove, setMembersToRemove] = useState<Set<ShowMember>>(new Set());

  // AI 翻译
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("hsik_deepseek_key") || "");
  const [targetLang, setTargetLang] = useState("中文");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState({ current: 0, total: 0 });
  const [translations, setTranslations] = useState<Record<string, string>>({});

  const [preview, setPreview] = useState<ShowItem[] | null>(null);

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
                content: `你是一个翻译助手。请将用户提供的文本翻译成${targetLang}。只返回翻译结果，不要解释，不要添加额外内容。`,
              },
              {
                role: "user",
                content: item.title,
              },
            ],
            temperature: 0.3,
          }),
        });
        const data = await resp.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          results[item.id] = data.choices[0].message.content.trim();
        } else {
          results[item.id] = item.title;
        }
      } catch {
        results[item.id] = item.title;
      }
      if (i < items.length - 1) await new Promise((r) => setTimeout(r, 500));
    }

    setTranslations(results);
    setIsTranslating(false);
  };

  const generatePreview = () => {
    const updated = items.map((item) => {
      let newItem = { ...item };

      if (activeTab === "title") {
        let newTitle = item.title;
        if (findText) {
          newTitle = newTitle.split(findText).join(replaceText);
        }
        if (prefixText) {
          newTitle = prefixText + newTitle;
        }
        if (suffixText) {
          newTitle = newTitle + suffixText;
        }
        newItem.title = newTitle;
      }

      if (activeTab === "members") {
        let newMembers = [...item.members];
        membersToAdd.forEach((m) => {
          if (!newMembers.includes(m)) newMembers.push(m);
        });
        newMembers = newMembers.filter((m) => !membersToRemove.has(m as ShowMember));
        newItem.members = newMembers as ShowMember[];
      }

      if (activeTab === "translate") {
        if (translations[item.id]) {
          newItem.title = translations[item.id];
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
    setMembersToAdd(new Set());
    setMembersToRemove(new Set());
    setTranslations({});
    setPreview(null);
    setActiveTab("title");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const toggleAddMember = (m: ShowMember) => {
    const next = new Set(membersToAdd);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    setMembersToAdd(next);
  };

  const toggleRemoveMember = (m: ShowMember) => {
    const next = new Set(membersToRemove);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    setMembersToRemove(next);
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
          <button onClick={() => { setActiveTab("title"); setPreview(null); }} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "title" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            <Type className="w-4 h-4" />标题
          </button>
          <button onClick={() => { setActiveTab("members"); setPreview(null); }} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "members" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            <Users className="w-4 h-4" />成员
          </button>
          <button onClick={() => { setActiveTab("translate"); setPreview(null); }} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "translate" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            <Languages className="w-4 h-4" />AI翻译
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {activeTab === "title" && (
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
                  <Type className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-medium text-gray-700">添加前后缀</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={prefixText} onChange={(e) => setPrefixText(e.target.value)} placeholder="前缀（如 [中字]）" className="px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-emerald-400" />
                  <input type="text" value={suffixText} onChange={(e) => setSuffixText(e.target.value)} placeholder="后缀（如 (精效中字)）" className="px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-emerald-400" />
                </div>
              </div>
            </div>
          )}

          {activeTab === "members" && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="flex items-center gap-2 mb-2">
                  <UserPlus className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-medium text-gray-700">添加成员</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allMembers.map((m) => (
                    <button key={m} onClick={() => toggleAddMember(m)} className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${membersToAdd.has(m) ? "bg-emerald-400 border-emerald-400 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-emerald-300"}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                <div className="flex items-center gap-2 mb-2">
                  <UserMinus className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-gray-700">移除成员</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allMembers.map((m) => (
                    <button key={m} onClick={() => toggleRemoveMember(m)} className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${membersToRemove.has(m) ? "bg-red-400 border-red-400 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-red-300"}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "translate" && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-violet-50 border border-violet-100">
                <div className="flex items-center gap-2 mb-3">
                  <KeyRound className="w-4 h-4 text-violet-500" />
                  <span className="text-sm font-medium text-gray-700">DeepSeek API 设置</span>
                </div>
                <div className="space-y-2">
                  <input
                    type="password"
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
                      {LANGUAGES.map((lang) => (
                        <option key={lang.key} value={lang.key}>{lang.label}</option>
                      ))}
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
                        <Languages className="w-4 h-4" />
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
                              <div className="max-w-[280px] whitespace-pre-wrap break-words text-sm">{item.title}</div>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <textarea
                                value={translations[item.id] || item.title}
                                onChange={(e) => updateTranslation(item.id, e.target.value)}
                                rows={Math.min(Math.max(Math.ceil(item.title.length / 25), 2), 6)}
                                className="w-full px-2 py-1.5 rounded border border-gray-200 text-sm outline-none focus:border-violet-400 resize-y min-h-[50px]"
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
                      <th className="px-3 py-2 text-left font-medium text-gray-600">原标题</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">→</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">新标题</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map((item, idx) => (
                      <tr key={item.id}>
                        <td className="px-3 py-1.5 text-gray-500 line-through">{items[idx].title}</td>
                        <td className="px-3 py-1.5 text-gray-300">→</td>
                        <td className="px-3 py-1.5 font-medium text-gray-900">{item.title}</td>
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
