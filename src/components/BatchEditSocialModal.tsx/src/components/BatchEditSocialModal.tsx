import { useState } from "react";
import { X, Replace, AlignLeft } from "lucide-react";
import type { SocialPost } from "@/lib/socialData";

interface BatchEditSocialModalProps {
  open: boolean;
  onClose: () => void;
  items: SocialPost[];
  onSave: (items: SocialPost[]) => void;
}

export default function BatchEditSocialModal({ open, onClose, items, onSave }: BatchEditSocialModalProps) {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [prefixText, setPrefixText] = useState("");
  const [suffixText, setSuffixText] = useState("");

  const [preview, setPreview] = useState<SocialPost[] | null>(null);

  const generatePreview = () => {
    const updated = items.map((item) => {
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
      return { ...item, content: newContent };
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
    setPreview(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">📝 批量编辑文案 ({items.length}条)</h2>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
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
                <input type="text" value={prefixText} onChange={(e) => setPrefixText(e.target.value)} placeholder="前缀" className="px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-emerald-400" />
                <input type="text" value={suffixText} onChange={(e) => setSuffixText(e.target.value)} placeholder="后缀" className="px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-emerald-400" />
              </div>
            </div>
          </div>

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
                        <td className="px-3 py-1.5 text-gray-500 line-through max-w-[200px] truncate">{items[idx].content}</td>
                        <td className="px-3 py-1.5 text-gray-300">→</td>
                        <td className="px-3 py-1.5 font-medium text-gray-900 max-w-[200px] truncate">{item.content}</td>
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
