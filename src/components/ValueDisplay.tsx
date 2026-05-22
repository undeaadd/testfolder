import React from 'react';
import { VT27_MODES } from '../vt27Protocol';
import { Shield, ShieldAlert, AlertTriangle, Disc, Volume2, Waves, Activity } from 'lucide-react';

interface ValueDisplayProps {
  currentValue: number;
  currentModeCode: number;
  warnThreshold: number;
  dangerThreshold: number;
  onSetMode?: (code: number) => void;
  isSimulatorActive: boolean;
}

export default function ValueDisplay({
  currentValue,
  currentModeCode,
  warnThreshold,
  dangerThreshold,
  onSetMode,
  isSimulatorActive
}: ValueDisplayProps) {
  const currentMode = VT27_MODES[currentModeCode] || VT27_MODES[0x22];
  
  // Custom bounds
  const minVal = currentMode.minVal;
  const maxVal = currentMode.maxVal;
  
  // Calculate percentage for level bar (clamped to 0..100)
  const percent = Math.min(100, Math.max(0, ((currentValue - minVal) / (maxVal - minVal)) * 100));
  
  // Determine severity profile
  let severity: 'normal' | 'warning' | 'danger' = 'normal';
  if (currentValue >= dangerThreshold) {
    severity = 'danger';
  } else if (currentValue >= warnThreshold) {
    severity = 'warning';
  }

  const getSeverityData = () => {
    switch (severity) {
      case 'danger':
        return {
          bg: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
          label: 'АВАРИЯ / DANGER',
          icon: <ShieldAlert className="w-5 h-5 text-rose-400 animate-bounce" />,
          barBg: 'bg-rose-500 shadow-md shadow-rose-500/40'
        };
      case 'warning':
        return {
          bg: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
          label: 'ПРЕДУПРЕЖДЕНИЕ',
          icon: <AlertTriangle className="w-5 h-5 text-amber-400 animate-pulse" />,
          barBg: 'bg-amber-500 shadow-md shadow-amber-500/40'
        };
      default:
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
          label: 'НОРМА / NORMAL',
          icon: <Shield className="w-5 h-5 text-emerald-400" />,
          barBg: 'bg-emerald-500'
        };
    }
  };

  const statusStyle = getSeverityData();

  const getModeIcon = (code: number) => {
    switch (code) {
      case 0x22: return <Disc className="w-4 h-4" />;
      case 0x23: return <Activity className="w-4 h-4" />;
      case 0x20: return <Waves className="w-4 h-4" />;
      case 0x10: return <ShieldAlert className="w-4 h-4" />;
      case 0x16: return <Volume2 className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <div id="value-display-panel" className="bg-[#111318] border border-slate-800/50 rounded-2xl p-6 flex flex-col justify-between h-full gap-6">
      {/* Top Meta info */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block mb-1">
            Текущий режим измерения
          </span>
          <h2 className="text-xl font-bold font-sans text-white tracking-tight flex items-center gap-2">
            <span style={{ color: currentMode.color }}>
              {getModeIcon(currentMode.code)}
            </span>
            {currentMode.name}
          </h2>
        </div>
        
        {/* State Tag */}
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono font-bold ${statusStyle.bg}`}>
          {statusStyle.icon}
          <span>{statusStyle.label}</span>
        </div>
      </div>

      {/* Main Digital value */}
      <div className="py-2 text-center relative bg-slate-900/20 rounded-xl border border-slate-800/20 p-4">
        <div className="absolute top-1.5 left-3 font-mono text-[9px] text-[#4f5864] uppercase tracking-widest">
          vt-27 digit indicator
        </div>
        <div className="inline-block relative">
          <span 
            className="text-7xl font-mono font-extrabold tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.02)] text-white block select-all"
            style={{ color: currentMode.color }}
          >
            {currentValue.toFixed(currentMode.code === 0x22 ? 1 : 3)}
          </span>
          <span className="absolute bottom-1 -right-16 font-mono text-slate-400 font-bold text-lg tracking-wide uppercase">
            {currentMode.unit}
          </span>
        </div>
      </div>

      {/* Industrial Bargraph Gauge */}
      <div>
        <div className="flex items-center justify-between text-[11px] font-mono mb-2">
          <span className="text-slate-500">Диапазон: {minVal} .. {maxVal} {currentMode.unit}</span>
          <div className="flex gap-4">
            <span className="text-amber-500/70">Предупр.: &ge;{warnThreshold.toFixed(1)}</span>
            <span className="text-rose-500/70">Крит: &ge;{dangerThreshold.toFixed(1)}</span>
          </div>
        </div>
        
        {/* Bar */}
        <div className="h-4 bg-slate-900 border border-slate-850 rounded-full overflow-hidden p-0.5 flex gap-0.5 relative">
          {/* Warning marker */}
          <div 
            style={{ left: `${((warnThreshold - minVal) / (maxVal - minVal)) * 100}%` }}
            className="absolute top-0 bottom-0 w-[2px] bg-amber-500/50 z-10"
            title="Граница предупреждения"
          ></div>
          {/* Danger marker */}
          <div 
            style={{ left: `${((dangerThreshold - minVal) / (maxVal - minVal)) * 100}%` }}
            className="absolute top-0 bottom-0 w-[2px] bg-rose-500/50 z-10"
          ></div>

          {/* Actual level */}
          <div 
            className={`h-full rounded-full transition-all duration-150 ${statusStyle.barBg}`}
            style={{ width: `${percent}%`, transition: 'width 100ms ease-out' }}
          ></div>
        </div>
      </div>

      {/* Shortcut selectors (especially useful for simulator mode) */}
      <div>
        <span className="text-[10px] uppercase font-mono tracking-widest text-slate-500 block mb-2.5">
          {isSimulatorActive ? 'Переключение режима (Имитатор)' : 'Доступные режимы датчика'}
        </span>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.values(VT27_MODES).map((mode) => {
            const isSelected = mode.code === currentModeCode;
            return (
              <button
                key={mode.code}
                id={`mode-btn-${mode.code}`}
                onClick={() => onSetMode && onSetMode(mode.code)}
                disabled={!isSimulatorActive}
                className={`py-2 px-1 rounded-lg text-center transition-all duration-150 flex flex-col items-center gap-1 border ${
                  isSelected
                    ? 'bg-[#181a20] border-slate-600 text-white shadow-sm'
                    : isSimulatorActive
                      ? 'bg-[#0A0B0D] hover:bg-[#181a20] border-slate-800/60 hover:border-slate-700 text-slate-400 hover:text-white'
                      : 'bg-[#0A0B0D]/40 border-slate-950 text-slate-600 cursor-not-allowed'
                }`}
                title={mode.name}
              >
                <span style={{ color: isSelected || isSimulatorActive ? mode.color : '#475569' }}>
                  {getModeIcon(mode.code)}
                </span>
                <span className="text-[10px] font-mono leading-none truncate w-full max-w-[70px]">
                  {mode.unit}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
