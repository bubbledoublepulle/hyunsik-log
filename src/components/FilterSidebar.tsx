import { motion } from "framer-motion";
import { Filter, X } from "lucide-react";
import type { MusicType, MusicRole } from "@/lib/musicData";

interface FilterSidebarProps {
  types: MusicType[];
  selectedTypes: Set<MusicType>;
  onToggleType: (type: MusicType) => void;
  years: number[];
  selectedYears: Set<number>;
  onToggleYear: (year: number) => void;
  roles: MusicRole[];
  selectedRoles: Set<MusicRole>;
  onToggleRole: (role: MusicRole) => void;
  onlySelfComposed: boolean;
  onToggleSelfComposed: () => void;
  onClearAll: () => void;
}

export default function FilterSidebar({
  types,
  selectedTypes,
  onToggleType,
  years,
  selectedYears,
  onToggleYear,
  roles,
  selectedRoles,
  onToggleRole,
  onlySelfComposed,
  onToggleSelfComposed,
  onClearAll,
}: FilterSidebarProps) {
  const hasActiveFilters =
    selectedTypes.size > 0 ||
    selectedYears.size > 0 ||
    selectedRoles.size > 0 ||
    onlySelfComposed;

  return (
    <motion.aside
      initial={{ opacity: 0, x: -15 }}
      animate={{ opacity: 1, x: 0 }}
      className="w-full lg:w-64 shrink-0"
    >
      <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto bg-white/40 rounded-sm border border-steel-200/60 shadow-sm p-4 sm:p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-steel-500" />
            <h3 className="text-sm font-bold text-steel-600">筛选</h3>
          </div>
          {hasActiveFilters && (
            <button
              onClick={onClearAll}
              className="text-xs text-steel-500/70 hover:text-red-500 flex items-center gap-0.5 transition-colors"
            >
              <X className="w-3 h-3" />
              清除
            </button>
          )}
        </div>

        <div className="mb-5">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600 mb-2.5">
            类型
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {types.map((type) => (
              <button
                key={type}
                onClick={() => onToggleType(type)}
                className={`shrink-0 px-3 py-1.5 rounded-sm text-xs font-medium border transition-all whitespace-nowrap ${
                  selectedTypes.has(type)
                    ? "bg-steel-500 text-white border-steel-500"
                    : "bg-white/50 text-steel-600 border-steel-200/60 hover:border-steel-400"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600 mb-2.5">
            年份
          </p>
          <div className="space-y-1.5">
            {years.map((year) => (
              <label
                key={year}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={selectedYears.has(year)}
                    onChange={() => onToggleYear(year)}
                    className="peer sr-only"
                  />
                  <div className="w-4 h-4 rounded border-2 border-steel-200/60 peer-checked:border-steel-500 peer-checked:bg-steel-500 transition-all flex items-center justify-center">
                    {selectedYears.has(year) && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-steel-600 group-hover:text-steel-900 transition-colors">
                  {year}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 text-steel-600 mb-2.5">
            角色
          </p>
          <div className="space-y-1.5">
            {roles.map((role) => (
              <label
                key={role}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={selectedRoles.has(role)}
                    onChange={() => onToggleRole(role)}
                    className="peer sr-only"
                  />
                  <div className="w-4 h-4 rounded border-2 border-steel-200/60 peer-checked:border-steel-500 peer-checked:bg-steel-500 transition-all flex items-center justify-center">
                    {selectedRoles.has(role) && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-steel-600 group-hover:text-steel-900 transition-colors">
                  {role}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-steel-200/40">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-steel-600">仅自作曲</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={onlySelfComposed}
                onChange={onToggleSelfComposed}
                className="peer sr-only"
              />
              <div className="w-9 h-5 bg-steel-200 rounded-full peer-checked:bg-steel-500 transition-colors" />
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                onlySelfComposed ? "translate-x-4" : ""
              }`} />
            </div>
          </label>
        </div>
      </div>
    </motion.aside>
  );
}
