import { useState } from "react";
import { X, Loader2, Link2, FileText, Check, ClipboardPaste } from "lucide-react";
import type { MusicItem, MusicRole, MusicType } from "@/lib/musicData";

interface BatchImportModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (items: MusicItem[]) => void;
}

export default function BatchImportModal({ open, onClose, onSave }: BatchImportModalProps) {
  const [mode, setMode] = useState<"melon" | "paste" | "manual">("paste");
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [manualText, setManualText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<MusicItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const extractArtistId = (input: string): string | null => {
    const match = input.match(/artistId=(\d+)/);
    return match ? match[1] : null;
  };

  // 精确解析从 Melon 页面复制的文字
  const parsePastedText = () => {
    const text = pastedText.trim();
    if (!text) {
      setError("请先粘贴内容");
      return;
    }

    const rawLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // 精确匹配要跳过的行
    const skipExact = [
      'NO', '곡명', '아티스트', '앨범', '좋아요', '뮤비', '다운',
      '재생 담기', '뮤직비디오', '전체선택', '전체'
    ];
    
    const songs: any[] = [];
    let currentSong: any = null;
    
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      
      // 精确匹配跳过表头和按钮
      if (skipExact.includes(line)) continue;
      
      // 跳过 "좋아요 8,296" 格式
      if (line.startsWith('좋아요')) continue;
      
      // 纯数字 = 新歌曲开始
      if (/^\d+$/.test(line)) {
        if (currentSong && currentSong.title) {
          songs.push(currentSong);
        }
        currentSong = { title: '', album: '', artist: '', type: '团体', roles: ['演唱'] };
        continue;
      }
      
      if (!currentSong) continue;
      
      // 跳过 "타이틀 곡 xxx" 格式（标题曲标记）
      if (line.startsWith('타이틀 곡')) continue;
      
      // 如果歌名还没设置，这一行就是歌名
      if (!currentSong.title) {
        currentSong.title = line;
        continue;
      }
      
      // 跳过与歌名 trim 后完全相同的行（Melon 页面上的重复歌名显示，如" 불씨"）
      // 但只在歌手还没设置时跳过，避免把和歌名相同的专辑名误跳过
      if (!currentSong.artist && line.trim() === currentSong.title) continue;
      
      // 如果歌手还没设置
      if (!currentSong.artist) {
        currentSong.artist = line;
        continue;
      }
      
      // 如果专辑还没设置
      if (!currentSong.album) {
        currentSong.album = line;
        continue;
      }
    }
    
    // 别忘了最后一个
    if (currentSong && currentSong.title) {
      songs.push(currentSong);
    }
    
    // 去重（基于 歌名+专辑）
    const seen = new Set();
    const unique = songs.filter(s => {
      const key = s.title + '|' + s.album;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    if (unique.length === 0) {
      setError("未能从粘贴内容中解析出歌曲，请检查粘贴内容是否来自 Melon 歌曲列表页面。");
      return;
    }
    
    const items: MusicItem[] = unique.map((s, idx) => ({
      id: `m-batch-${Date.now()}-${idx}`,
      title: s.title,
      album: s.album || '未知专辑',
      releaseDate: '',
      type: '团体' as MusicType,
      roles: ['演唱'] as MusicRole[],
      plays: '',
      link: '',
      isSelfComposed: false,
    }));
    
    setPreview(items);
    setSelectedIds(new Set(items.map(i => i.id)));
    setError('');
  };

  const parseMelon = async () => {
    const artistId = extractArtistId(url);
    if (!artistId) {
      setError("无法从链接中提取 artistId");
      return;
    }
    setLoading(true);
    setError("");
    setPreview([]);
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.melon.com/artist/songList.htm?artistId=${artistId}`)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) {
        setError("Melon 抓取失败，请使用「粘贴页面文字」模式。");
        return;
      }
      const html = await res.text();
      if (!html.includes("ellipsis")) {
        setError("无法解析，请使用「粘贴页面文字」模式。");
        return;
      }
      const songs: any[] = [];
      const titleMatches = [...html.matchAll(/<a[^>]*class="ellipsis"[^>]*title="([^"]*)"[^>]*>/g)];
      const dateMatches = [...html.matchAll(/<td[^>]*class="t_center"[^>]*>([\d.]+)<\/td>/g)];
      for (let i = 0; i < titleMatches.length - 1; i += 2) {
        const title = titleMatches[i][1].replace(/&amp;/g, "&").trim();
        const album = (titleMatches[i + 1]?.[1] || "").replace(/&amp;/g, "&").trim();
        const date = dateMatches[Math.floor(i / 2)]?.[1] || "";
        if (title && title !== "곡명") {
          songs.push({ title, album: album || "未知专辑", date: date ? date.replace(/\./g, "-") : "", type: "团体", roles: ["演唱"], plays: "", link: "", isSelfComposed: false });
        }
      }
      const seen = new Set();
      const unique = songs.filter(s => { const key = s.title + "|" + s.album; if (seen.has(key)) return false; seen.add(key); return true; });
      if (unique.length === 0) { setError("未解析到歌曲，请使用「粘贴页面文字」模式。"); return; }
      const items: MusicItem[] = unique.map((s: any, i: number) => ({ id: `m-batch-${Date.now()}-${i}`, title: s.title, album: s.album, releaseDate: s.date, type: s.type, roles: s.roles, plays: s.plays, link: s.link, isSelfComposed: s.isSelfComposed }));
      setPreview(items);
      setSelectedIds(new Set(items.map((item) => item.id)));
    } catch (e: any) {
      setError(`请求失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const parseManual = () => {
    const lines = manualText.trim().split("\n").filter((l) => l.trim());
    const items: MusicItem[] = [];
    lines.forEach((line, i) => {
      const parts = line.split("|").map((p) => p.trim());
      const [title, album, date, type, rolesStr, link] = parts;
      if (!title) return;
      const roles = (rolesStr || "演唱").split(/[,，]/).map((r) => r.trim()).filter((r) => r) as MusicRole[];
      items.push({ id: `m-batch-${Date.now()}-${i}`, title, album: album || "未知专辑", releaseDate: date || "", type: (type as MusicType) || "团体", roles: roles.length > 0 ? roles : ["演唱"], plays: "", link: link || "", isSelfComposed: roles.includes("作曲") || roles.includes("作词") });
    });
    setPreview(items);
    setSelectedIds(new Set(items.map((item) => item.id)));
    setError("");
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const handleSave = () => {
    const selected = preview.filter((item) => selectedIds.has(item.id));
    if (selected.length === 0) return;
    onSave(selected);
    reset();
  };

  const reset = () => {
    setUrl(""); setPastedText(""); setManualText(""); setPreview([]); setSelectedIds(new Set()); setError(""); setMode("paste");
  };
  const handleClose = () => { reset(); onClose(); };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">🎵 批量导入音乐档案</h2>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="flex p-1 mx-6 mt-4 bg-gray-100 rounded-xl">
          <button onClick={() => setMode("paste")} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${mode === "paste" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}><ClipboardPaste className="w-4 h-4" />粘贴页面文字</button>
          <button onClick={() => setMode("melon")} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${mode === "melon" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}><Link2 className="w-4 h-4" />Melon 链接</button>
          <button onClick={() => setMode("manual")} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${mode === "manual" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}><FileText className="w-4 h-4" />手动粘贴</button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4">
          {mode === "paste" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">从 Melon 页面复制的文字</label>
                <div className="text-xs text-gray-500 mb-2 space-y-0.5">
                  <p>1. 打开 Melon 歌手歌曲列表页面</p>
                  <p>2. 按 <kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-700 font-mono">Ctrl+A</kbd> 全选，<kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-700 font-mono">Ctrl+C</kbd> 复制</p>
                  <p>3. 粘贴到下方，点击智能解析</p>
                </div>
                <textarea value={pastedText} onChange={(e) => setPastedText(e.target.value)} placeholder={`粘贴后内容示例（Melon 页面复制）：&#10;NO&#10;곡명&#10;아티스트&#10;앨범&#10;...&#10;1&#10;재생 담기 &#10;우리 다시&#10; 타이틀 곡 우리 다시&#10;비투비&#10;우리 다시&#10;좋아요 8,296&#10;뮤직비디오&#10;다운&#10;...`} rows={10} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all resize-none font-mono" />
                <button onClick={parsePastedText} disabled={!pastedText.trim()} className="mt-3 px-4 py-2 rounded-xl bg-sky-400 text-white text-sm font-medium hover:bg-sky-500 transition-colors disabled:opacity-50">智能解析</button>
              </div>
            </div>
          )}
          {mode === "melon" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Melon 歌手主页链接</label>
                <div className="flex gap-2">
                  <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.melon.com/artist/song.htm?artistId=672289" className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all" />
                  <button onClick={parseMelon} disabled={loading || !url.trim()} className="px-4 py-2.5 rounded-xl bg-sky-400 text-white text-sm font-medium hover:bg-sky-500 transition-colors disabled:opacity-50 flex items-center gap-1.5">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}解析</button>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">如果解析失败，请使用「粘贴页面文字」模式</p>
              </div>
            </div>
          )}
          {mode === "manual" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">手动粘贴歌曲列表</label>
                <textarea value={manualText} onChange={(e) => setManualText(e.target.value)} placeholder={`歌名 | 专辑 | 发行日期 | 类型 | 角色 | 链接&#10;Missing You | Brother Act. | 2017-10-16 | 团体 | 演唱,作曲,作词 | https://music.apple.com&#10;The Girl | Walk and Talk | 2024-02-29 | SOLO | 演唱,作曲,作词,编曲 | `} rows={8} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all resize-none font-mono" />
                <p className="text-xs text-gray-400 mt-1.5">每行一首歌，用 | 分隔字段。角色用逗号分隔。</p>
                <button onClick={parseManual} disabled={!manualText.trim()} className="mt-3 px-4 py-2 rounded-xl bg-sky-400 text-white text-sm font-medium hover:bg-sky-500 transition-colors disabled:opacity-50">预览</button>
              </div>
            </div>
          )}
          {error && <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">⚠️ {error}</div>}
          {preview.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-gray-900">预览 ({selectedIds.size}/{preview.length} 条已选择)</h3>
                <button onClick={() => setSelectedIds(new Set(preview.map((i) => i.id)))} className="text-xs text-sky-500 hover:text-sky-600 font-medium">全选</button>
              </div>
              <div className="border border-gray-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr><th className="w-10 px-3 py-2 text-left"><input type="checkbox" checked={selectedIds.size === preview.length && preview.length > 0} onChange={(e) => { if (e.target.checked) setSelectedIds(new Set(preview.map((i) => i.id))); else setSelectedIds(new Set()); }} className="rounded border-gray-300" /></th><th className="px-3 py-2 text-left font-medium text-gray-600">歌名</th><th className="px-3 py-2 text-left font-medium text-gray-600">专辑</th><th className="px-3 py-2 text-left font-medium text-gray-600">日期</th><th className="px-3 py-2 text-left font-medium text-gray-600">类型</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map((item) => (
                      <tr key={item.id} onClick={() => toggleSelect(item.id)} className={`cursor-pointer transition-colors ${selectedIds.has(item.id) ? "bg-sky-50/50" : "hover:bg-gray-50"}`}>
                        <td className="px-3 py-2"><div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selectedIds.has(item.id) ? "bg-sky-400 border-sky-400" : "border-gray-300 bg-white"}`}>{selectedIds.has(item.id) && <Check className="w-3.5 h-3.5 text-white" />}</div></td>
                        <td className="px-3 py-2 font-medium text-gray-900">{item.title}</td>
                        <td className="px-3 py-2 text-gray-500">{item.album}</td>
                        <td className="px-3 py-2 text-gray-500">{item.releaseDate}</td>
                        <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">{item.type}</span></td>
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
          <button onClick={handleSave} disabled={selectedIds.size === 0} className="px-5 py-2 rounded-xl bg-sky-400 text-white text-sm font-medium hover:bg-sky-500 transition-colors disabled:opacity-50">确认添加 {selectedIds.size > 0 ? `(${selectedIds.size}条)` : ""}</button>
        </div>
      </div>
    </div>
  );
}
