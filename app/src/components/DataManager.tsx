import { useState, useRef } from "react";
import { Download, Upload, Database, CloudUpload, CloudCheck } from "lucide-react";
import { toast } from "sonner";
import { migrateMusicToSupabase } from "@/lib/musicData";
import { migrateShowsToSupabase } from "@/lib/showData";
import { migrateSocialToSupabase } from "@/lib/socialData";
import { isSupabaseConfigured } from "@/lib/supabase";

const STORAGE_KEYS = {
  music: "hsik_music_data",
  shows: "hsik_shows_data",
  social: "hsik_social_data",
} as const;

interface ExportData {
  version: 1;
  exportedAt: string;
  music: unknown;
  shows: unknown;
  social: unknown;
}

export default function DataManager() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const handleExport = () => {
    const data: ExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      music: JSON.parse(localStorage.getItem(STORAGE_KEYS.music) || "null"),
      shows: JSON.parse(localStorage.getItem(STORAGE_KEYS.shows) || "null"),
      social: JSON.parse(localStorage.getItem(STORAGE_KEYS.social) || "null"),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `siklog-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("数据已导出", {
      description: `备份文件已下载，包含 ${countItems(data)} 条数据`,
    });
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const data: ExportData = JSON.parse(text);

      if (!data.version || !data.music || !data.shows || !data.social) {
        throw new Error("无效的备份文件格式");
      }

      if (data.music) {
        localStorage.setItem(STORAGE_KEYS.music, JSON.stringify(data.music));
      }
      if (data.shows) {
        localStorage.setItem(STORAGE_KEYS.shows, JSON.stringify(data.shows));
      }
      if (data.social) {
        localStorage.setItem(STORAGE_KEYS.social, JSON.stringify(data.social));
      }

      toast.success("数据已导入", {
        description: `共恢复 ${countItems(data)} 条数据，页面即将刷新`,
      });

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      toast.error("导入失败", {
        description: err instanceof Error ? err.message : "文件格式不正确",
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleMigrate = async () => {
    if (!isSupabaseConfigured()) {
      toast.error("Supabase 未配置", {
        description: "请先配置 Supabase 环境变量后再迁移",
      });
      return;
    }
    setMigrating(true);
    try {
      const [musicRes, showsRes, socialRes] = await Promise.all([
        migrateMusicToSupabase(),
        migrateShowsToSupabase(),
        migrateSocialToSupabase(),
      ]);

      const total = musicRes.success + showsRes.success + socialRes.success;
      const errors = [musicRes.error, showsRes.error, socialRes.error].filter(Boolean);

      if (errors.length > 0) {
        toast.warning("迁移完成，部分失败", {
          description: errors.join("; "),
        });
      } else {
        toast.success("迁移成功", {
          description: `共迁移 ${total} 条数据到云端`,
        });
      }
    } catch (err) {
      toast.error("迁移失败", {
        description: err instanceof Error ? err.message : "未知错误",
      });
    } finally {
      setMigrating(false);
    }
  };

  function countItems(data: ExportData): number {
    let count = 0;
    if (Array.isArray(data.music)) count += data.music.length;
    if (Array.isArray(data.shows)) count += data.shows.length;
    if (Array.isArray(data.social)) count += data.social.length;
    return count;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Database className="w-4 h-4 text-sky-500" />
        <h3 className="text-sm font-bold text-gray-900">数据管理</h3>
        <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
          管理员
        </span>
      </div>

      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        数据已同步到云端数据库。如需在另一台设备同步，请使用「导出/导入」功能。
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-50 text-sky-600 text-sm font-medium hover:bg-sky-100 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          导出数据
        </button>
        <button
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-50 text-gray-600 text-sm font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          {importing ? "导入中..." : "导入数据"}
        </button>
        <button
          onClick={handleMigrate}
          disabled={migrating}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-600 text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
        >
          {migrating ? (
            <CloudUpload className="w-3.5 h-3.5 animate-pulse" />
          ) : (
            <CloudCheck className="w-3.5 h-3.5" />
          )}
          {migrating ? "迁移中..." : "迁移到云端"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
}
