import { useState } from "react";
import { X, Check, Users, Type, Replace, UserPlus, UserMinus } from "lucide-react";
import type { ShowItem, ShowMember } from "@/lib/showData";

const allMembers: ShowMember[] = [
  "任炫植",
  "徐恩光",
  "李旼赫",
  "李昌燮",
  "Peniel",
  "陆星材",
  "全体",
];

interface BatchEditShowsModalProps {
  open: boolean;
  onClose: () => void;
  items: ShowItem[];
  onSave: (items: ShowItem[]) => void;
}

export default function BatchEditShowsModal({ open, onClose, items, onSave }: BatchEditShowsModalProps) {
  const [activeTab, setActiveTab] = useState<"title" | "members">("title");

  // 标题编辑
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [prefixText, setPrefixText] = useState("");
  const [suffixText, setSuffixText] = useState("");

  // 成员编辑
  const [membersToAdd, setMembersToAdd] = useState<Set<ShowMember>>(new Set());
  const [membersToRemove, setMembersToRemove] = useState<Set<ShowMember>>(new Set());

  const [preview, setPreview] = useState<ShowItem[] | null>(null);

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
