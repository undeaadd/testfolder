import React from 'react';
import { Stats, VT27Mode } from '../types';
import { ArrowDown, ArrowUp, BarChart2, ShieldCheck, Database } from 'lucide-react';

interface StatsPanelProps {
  stats: Stats;
  activeMode: VT27Mode;
  violationsCount: number;
  totalPoints: number;
  onClearStats: () => void;
}

export default function StatsPanel({
  stats,
  activeMode,
  violationsCount,
  totalPoints,
  onClearStats
}: StatsPanelProps) {
  const formatVal = (val: number) => {
    if (val === Infinity || val === -Infinity) return '---';
    return val.toFixed(activeMode.code === 0x22 ? 1 : 3);
  };

  const violationPercent = totalPoints > 0 ? (violationsCount / totalPoints) * 100 : 0;

  return (
    <div id="stats-panel" className="bg-[#111318] border border-slate-800/50 rounded-2xl p-5 flex flex-col justify-between h-full gap-5">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-800/50 pb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-indigo-400" />
          <h3 className="font-sans font-bold text-sm tracking-tight text-white uppercase">Статистика замеров</h3>
        </div>
        
        <button
          id="btn-reset-stats"
          onClick={onClearStats}
          className="text-[10px] uppercase font-mono tracking-wider font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 rounded border border-rose-500/20 transition-all duration-150"
        >
          Сброс
        </button>
      </div>

      {/* Grid numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 my-auto">
        {/* Min */}
        <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-mono font-bold uppercase mb-1">
            <span>Минимум</span>
            <ArrowDown className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div>
            <span className="text-xl font-mono font-bold text-emerald-400">
              {formatVal(stats.min)}
            </span>
            <span className="text-[10px] text-slate-500 font-mono ml-1">{activeMode.unit}</span>
          </div>
        </div>

        {/* Max */}
        <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-mono font-bold uppercase mb-1">
            <span>Максимум</span>
            <ArrowUp className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div>
            <span className="text-xl font-mono font-bold text-rose-400">
              {formatVal(stats.max)}
            </span>
            <span className="text-[10px] text-slate-500 font-mono ml-1">{activeMode.unit}</span>
          </div>
        </div>

        {/* Average */}
        <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-mono font-bold uppercase mb-1">
            <span>Среднее</span>
            <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div>
            <span className="text-xl font-mono font-bold text-indigo-400">
              {formatVal(stats.avg)}
            </span>
            <span className="text-[10px] text-slate-500 font-mono ml-1">{activeMode.unit}</span>
          </div>
        </div>

        {/* Count */}
        <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-mono font-bold uppercase mb-1">
            <span>Замеров</span>
            <Database className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div>
            <span className="text-xl font-mono font-bold text-slate-300">
              {stats.count}
            </span>
            <span className="text-[10px] text-slate-500 font-mono ml-1">точек</span>
          </div>
        </div>
      </div>

      {/* Threshold Violation warnings */}
      <div className="border-t border-slate-800/50 pt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`w-4 h-4 ${violationsCount > 0 ? 'text-amber-500 animate-pulse' : 'text-emerald-500'}`} />
          <span className="text-slate-400">
            Превышения нормы:
          </span>
          <span className={`font-bold ${violationsCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {violationsCount} раз
          </span>
          {violationsCount > 0 && (
            <span className="text-slate-600 text-[10px]">({violationPercent.toFixed(1)}%)</span>
          )}
        </div>
        <div className="text-slate-500 text-[10px]">
          Буфер: max {totalPoints} точек
        </div>
      </div>
    </div>
  );
}
