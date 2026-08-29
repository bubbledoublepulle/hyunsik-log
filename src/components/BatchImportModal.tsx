import { useState } from "react";
import { X, Loader2, Link2, FileText, Check, ClipboardPaste, Settings2 } from "lucide-react";
import type { MusicItem, MusicRole, MusicType } from "@/lib/musicData";

interface BatchImportModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (items: MusicItem[]) => void;
}

const ALL_TYPES: MusicType[] = ["录音室", "live", "OST", "合作", "仅制作"];
const ALL_ROLES: MusicRole[] = ["演唱", "作曲", "作词", "编曲"];

export default function BatchImportModal({ open, onClose, onSave }: BatchImportModalProps) {
  const [mode, setMode] = useState<"melon" | "paste" | "manual">("paste");
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [manualText, setManualText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<MusicItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchEdit, setShowBatchEdit] = useState(false);

  const [batchDate, setBatchDate] = useState("");
  const [batchAlbum, setBatchAlbum] = useState("");
  const [batchArtist, setBatchArtist] = useState("");
  const [batchType, setBatchType] = useState<MusicType>("录音室");
  const [batchRoles, setBatchRoles] = useState<Set<MusicRole>>(new Set());

  const extractArtistId = (input: string): string | null => {
    const match = input.match(/artistId=(\d+)/);
    return match ? match[1] : null;
  };

  const parsePastedText = () => {
    const text = pastedText.trim();
    if (!text) { setError("请先粘贴内容"); return; }
    const rawLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const skipExact = ['NO', '곡명', '아티스트', '앨범', '좋아요', '뮤비', '다운', '재생 담기', '뮤직비디오', '전체선택', '전체', 'HOT', 'NEW', '아티스트명 더보기'];
    const songs: any[] = [];
    let currentSong: any = null;
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (skipExact.includes(line)) continue;
      if (line.startsWith('좋아요')) continue;
      if (line.startsWith('타이틀 곡')) continue;
      if (line.startsWith('인기 곡')) continue;
      if (line.startsWith('HOT') || line.startsWith('NEW')) continue;
      if (/^\d+$/.test(line)) {
        if (currentSong && currentSong.title) songs.push(currentSong);
        currentSong = { title: '', album: '', artist: '', type: '录音室', roles: ['演唱'] };
        continue;
      }
      if (!currentSong) continue;
      if (!currentSong.title) { currentSong.title = line; continue; }
      if (!currentSong.artist && line === currentSong.title) continue;
      if (!currentSong.artist) { currentSong.artist = line; continue; }
      if (!currentSong.album) { currentSong.album = line; continue; }
    }
    if (currentSong && currentSong.title) songs.push(currentSong);
    const seen = new Set();
    const unique = songs.filter(s => { const key = s.title + '|' + s.album; if (seen.has(key)) return false; seen.add(key); return true; });
    if (unique.length === 0) { setError("未能解析出歌曲"); return; }
    const items: MusicItem[] = unique.map((s, idx) => ({ id: `m-batch-${Date.now()}-${idx}`, title: s.title, artist: s.artist || '', album: s.album || '未知专辑', releaseDate: '', type: '录音室', roles: ['演唱'], plays: '', link: '', isSelfComposed: false }));
    setPreview(items);
    setSelectedIds(new Set(items.map(i => i.id)));
    setError('');
  };

  const parseMelon = async () => {
    const artistId = extractArtistId(url);
    if (!artistId) { setError("无法提取 artistId"); return; }
    setLoading(true); setError(""); setPreview([]);
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.melon.com/artist/songList.htm?artistId=${artistId}`)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) { setError("抓取失败，请使用粘贴模式"); return; }
      const html = await res.text();
      if (!html.includes("ellipsis")) { setError("无法解析，请使用粘贴模式"); return; }
      const songs: any[] = [];
      const titleMatches = [...html.matchAll(/<a[^>]*class="ellipsis"[^>]*title="([^"]*)"[^>]*>/g)];
      const dateMatches = [...html.matchAll(/<td[^>]*class="t_center"[^>]*>([\d.]+)<\/td>/g)];
      for (let i = 0; i < titleMatches.length - 1; i += 2) {
        const title = titleMatches[i][1].replace(/&amp;/g, "&").trim();
        const album = (titleMatches[i + 1]?.[1] || "").replace(/&amp;/g, "&").trim();
        const date = dateMatches[Math.floor(i / 2)]?.[1] || "";
        if (title && title !== "곡명") songs.push({ title, album: album || "未知专辑", date: date ? date.replace(/\./g, "-") : "", type: "录音室", roles: ["演唱"], plays: "", link: "", isSelfComposed: false });
      }
      const seen = new Set();
      const unique = songs.filter(s => { const key = s.title + "|" + s.album; if (seen.has(key)) return false; seen.add(key); return true; });
      if (unique.length === 0) { setError("未解析到歌曲"); return; }
      const items: MusicItem[] = unique.map((s, i) => ({ id: `m-batch-${Date.now()}-${i}`, title: s.title, artist: '', album: s.album, releaseDate: s.date, type: s.type, roles: s.roles, plays: s.plays, link: s.link, isSelfComposed: s.isSelfComposed }));
      setPreview(items);
      setSelectedIds(new Set(items.map(i => i.id)));
    } catch (e: any) { setError(`请求失败: ${e.message}`); }
    finally { setLoading(false); }
  };

  const parseManual = () => {
    const lines = manualText.trim().split("\n").filter(l => l.trim());
    const items: MusicItem[] = [];
    lines.forEach((line, i) => {
      const parts = line.split("|").map(p => p.trim());
      const [title, artist, album, date, type, rolesStr, link] = parts;
      if (!title) return;
      const roles = (rolesStr || "演唱").split(/[,，]/).map(r => r.trim()).filter(r => r) as MusicRole[];
      items.push({ id: `m-batch-${Date.now()}-${i}`, title, artist: artist || '', album: album || "未知专辑", releaseDate: date || "", type: (type as MusicType) || "录音室", roles: roles.length > 0 ? roles : ["演唱"], plays: "", link: link || "", isSelfComposed: roles.includes("作曲") || roles.includes("作词") });
    });
    setPreview(items);
    setSelectedIds(new Set(items.map(i => i.id)));
    setError("");
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const updateItemField = (id: string, field: keyof MusicItem, value: any) => {
    setPreview(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const applyBatchEdit = () => {
    if (selectedIds.size === 0) return;
    setPreview(prev => prev.map(item => {
      if (!selectedIds.has(item.id)) return item;
      const updates: any = {};
      if (batchDate) updates.releaseDate = batchDate;
      if (batchAlbum) updates.album = batchAlbum;
      if (batchArtist) updates.artist = batchArtist;
      if (batchType) updates.type = batchType;
      if (batchRoles.size > 0) {
        updates.roles = Array.from(batchRoles);
        updates.isSelfComposed = updates.roles.includes("作曲") || updates.roles.includes("作词");
      }
      return { ...item, ...updates };
    }));
    setBatchDate(""); setBatchAlbum(""); setBatchArtist(""); setBatchRoles(new Set());
  };

  const toggleBatchRole = (role: MusicRole) => {
    const next = new Set(batchRoles);
    if (next.has(role)) next.delete(role); else next.add(role);
    setBatchRoles(next);
  };

  const handleSave = () => {
    const selected = preview.filter(item => selectedIds.has(item.id));
    if (selected.length === 0) return;
    onSave(selected);
    reset();
  };

  const reset = () => {
    setUrl(""); setPastedText(""); setManualText(""); setPreview([]); setSelectedIds(new Set());
    setError(""); setMode("paste"); setShowBatchEdit(false);
    setBatchDate(""); setBatchAlbum(""); setBatchArtist(""); setBatchRoles(new Set());
  };
  const handleClose = () => { reset(); onClose(); };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
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
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">从 Melon 页面复制的文字</label>
              <div className="text-xs text-gray-500 space-y-0.5">
                <p>1. 打开 Melon 歌手歌曲列表页面</p>
                <p>2. 按 <kbd className="px-1 py-0.5 bg-gray-100 rounded font-mono">Ctrl+A</kbd> 全选，<kbd className="px-1 py-0.5 bg-gray-100 rounded font-mono">Ctrl+C</kbd> 复制</p>
                <p>3. 粘贴到下方，点击智能解析</p>
              </div>
              <textarea value={pastedText} onChange={e => setPastedText(e.target.value)} placeholder="粘贴 Melon 页面复制的文字..." rows={6} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all resize-none font-mono" />
              <button onClick={parsePastedText} disabled={!pastedText.trim()} className="px-4 py-2 rounded-xl bg-sky-400 text-white text-sm font-medium hover:bg-sky-500 transition-colors disabled:opacity-50">智能解析</button>
            </div>
          )}
          {mode === "melon" && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Melon 歌手主页链接</label>
              <div className="flex gap-2">
                <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.melon.com/artist/song.htm?artistId=672289" className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all" />
                <button onClick={parseMelon} disabled={loading || !url.trim()} className="px-4 py-2.5 rounded-xl bg-sky-400 text-white text-sm font-medium hover:bg-sky-500 transition-colors disabled:opacity-50 flex items-center gap-1.5">{loading && <Loader2 className="w-4 h-4 animate-spin" />}解析</button>
              </div>
            </div>
          )}
          {mode === "manual" && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">手动粘贴歌曲列表</label>
              <textarea value={manualText} onChange={e => setManualText(e.target.value)} placeholder="歌名 | 歌手 | 专辑 | 发行日期 | 类型 | 角色 | 链接" rows={6} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all resize-none font-mono" />
              <p className="text-xs text-gray-400">每行一首歌，用 | 分隔字段。角色用逗号分隔。</p>
              <button onClick={parseManual} disabled={!manualText.trim()} className="px-4 py-2 rounded-xl bg-sky-400 text-white text-sm font-medium hover:bg-sky-500 transition-colors disabled:opacity-50">预览</button>
            </div>
          )}

          {error && <div className="mt-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">⚠️ {error}</div>}

          {preview.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">预览 ({selectedIds.size}/{preview.length} 条已选择)</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedIds(new Set(preview.map(i => i.id)))} className="text-xs text-sky-500 hover:text-sky-600 font-medium">全选</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-500 hover:text-gray-600 font-medium">取消全选</button>
                  {selectedIds.size > 0 && (
                    <>
                      <span className="text-gray-300">|</span>
                      <button onClick={() => setShowBatchEdit(!showBatchEdit)} className={`text-xs font-medium flex items-center gap-1 ${showBatchEdit ? "text-sky-600" : "text-emerald-500 hover:text-emerald-600"}`}>
                        <Settings2 className="w-3 h-3" />{showBatchEdit ? "收起批量设置" : "批量设置"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {showBatchEdit && selectedIds.size > 0 && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 space-y-2">
                  <p className="text-xs font-medium text-emerald-700">对选中的 {selectedIds.size} 首歌批量设置：</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">发行日期</label>
                      <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-emerald-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">歌手</label>
                      <input type="text" value={batchArtist} onChange={e => setBatchArtist(e.target.value)} placeholder="输入歌手名" className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-emerald-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">专辑名称</label>
                      <input type="text" value={batchAlbum} onChange={e => setBatchAlbum(e.target.value)} placeholder="输入专辑名" className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-emerald-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">类型</label>
                      <select value={batchType} onChange={e => setBatchType(e.target.value as MusicType)} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-emerald-400">
                        {ALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 mb-0.5 block">角色</label>
                      <div className="flex flex-wrap gap-1">
                        {ALL_ROLES.map(role => (
                          <button key={role} onClick={() => toggleBatchRole(role)} className={`px-2 py-0.5 rounded text-xs border transition-colors ${batchRoles.has(role) ? "bg-emerald-400 border-emerald-400 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-emerald-300"}`}>{role}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button onClick={applyBatchEdit} className="w-full py-1.5 rounded-lg bg-emerald-400 text-white text-sm font-medium hover:bg-emerald-500 transition-colors">应用到选中的歌曲</button>
                </div>
              )}

              <div className="border border-gray-100 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="w-8 px-2 py-2 text-left"><input type="checkbox" checked={selectedIds.size === preview.length && preview.length > 0} onChange={e => { if (e.target.checked) setSelectedIds(new Set(preview.map(i => i.id))); else setSelectedIds(new Set()); }} className="rounded border-gray-300" /></th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">歌名</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">歌手</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">专辑</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">日期</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">类型</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">角色</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map(item => (
                      <tr key={item.id} className={`transition-colors ${selectedIds.has(item.id) ? "bg-sky-50/50" : "hover:bg-gray-50"}`}>
                        <td className="px-2 py-1.5" onClick={() => toggleSelect(item.id)}>
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all cursor-pointer ${selectedIds.has(item.id) ? "bg-sky-400 border-sky-400" : "border-gray-300 bg-white"}`}>
                            {selectedIds.has(item.id) && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 font-medium text-gray-900">{item.title}</td>
                        <td className="px-2 py-1.5">
                          <input type="text" value={item.artist} onChange={e => updateItemField(item.id, "artist", e.target.value)} className="w-full px-1.5 py-0.5 rounded border border-transparent hover:border-gray-200 focus:border-sky-400 focus:ring-1 focus:ring-sky-100 text-sm bg-transparent outline-none transition-all" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="text" value={item.album} onChange={e => updateItemField(item.id, "album", e.target.value)} className="w-full px-1.5 py-0.5 rounded border border-transparent hover:border-gray-200 focus:border-sky-400 focus:ring-1 focus:ring-sky-100 text-sm bg-transparent outline-none transition-all" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="date" value={item.releaseDate} onChange={e => updateItemField(item.id, "releaseDate", e.target.value)} className="w-full px-1.5 py-0.5 rounded border border-transparent hover:border-gray-200 focus:border-sky-400 focus:ring-1 focus:ring-sky-100 text-sm bg-transparent outline-none transition-all" />
                        </td>
                        <td className="px-2 py-1.5">
                          <select value={item.type} onChange={e => updateItemField(item.id, "type", e.target.value)} className="w-full px-1 py-0.5 rounded border border-transparent hover:border-gray-200 focus:border-sky-400 text-xs bg-transparent outline-none cursor-pointer">
                            {ALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-wrap gap-0.5">
                            {ALL_ROLES.map(role => (
                              <button key={role} onClick={() => {
                                const next = new Set(item.roles);
                                if (next.has(role)) next.delete(role); else next.add(role);
                                const roles = Array.from(next) as MusicRole[];
                                updateItemField(item.id, "roles", roles);
                                updateItemField(item.id, "isSelfComposed", roles.includes("作曲") || roles.includes("作词"));
                              }} className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${item.roles.includes(role) ? "bg-sky-100 border-sky-200 text-sky-700" : "bg-gray-50 border-gray-100 text-gray-400 hover:border-gray-300"}`}>{role}</button>
                            ))}
                          </div>
                        </td>
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
