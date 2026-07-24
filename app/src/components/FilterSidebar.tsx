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
      <div className="lg:sticky lg:top-20 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-sky-500" />
            <h3 className="font-bold text-gray-900 text-sm">筛选</h3>
          </div>
          {hasActiveFilters && (
            <button
              onClick={onClearAll}
              className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-0.5 transition-colors"
            >
              <X className="w-3 h-3" />
              清除
            </button>
          )}
        </div>

        {/* Type filter */}
        <div className="mb-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2.5">
            类型
          </p>
          <div className="space-y-1.5">
            {types.map((type) => (
              <label
                key={type}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={selectedTypes.has(type)}
                    onChange={() => onToggleType(type)}
                    className="peer sr-only"
                  />
                  <div className="w-4 h-4 rounded border-2 border-gray-200 peer-checked:border-sky-400 peer-checked:bg-sky-400 transition-all flex items-center justify-center">
                    {selectedTypes.has(type) && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                  {type}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Year filter */}
        <div className="mb-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2.5">
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
                  <div className="w-4 h-4 rounded border-2 border-gray-200 peer-checked:border-sky-400 peer-checked:bg-sky-400 transition-all flex items-center justify-center">
                    {selectedYears.has(year) && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                  {year}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Role filter */}
        <div className="mb-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2.5">
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
                  <div className="w-4 h-4 rounded border-2 border-gray-200 peer-checked:border-sky-400 peer-checked:bg-sky-400 transition-all flex items-center justify-center">
                    {selectedRoles.has(role) && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                  {role}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Self-composed toggle */}
        <div className="pt-4 border-t border-gray-50">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-gray-600">仅自作曲</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={onlySelfComposed}
                onChange={onToggleSelfComposed}
                className="peer sr-only"
              />
              <div className="w-9 h-5 bg-gray-200 rounded-full peer-checked:bg-sky-400 transition-colors" />
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
