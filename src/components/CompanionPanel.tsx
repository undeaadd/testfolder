import React, { useRef } from 'react';
import { ConnectionStatus } from '../types';
import { 
  Play, 
  Square, 
  Trash2, 
  Download, 
  Cpu, 
  Radio, 
  Scale, 
  Flame, 
  Clock, 
  CheckCircle2, 
  RefreshCw,
  HardDrive,
  Save as SaveIcon
} from 'lucide-react';

export interface CompanionTelemetry {
  seq?: number;
  t_s: number;    // Полная длительность дозирования (мс)
  t_r: number;    // Оставшееся время дозирования (мс)
  r_s: number;    // Заданная длительность разгона ШИМ (мс)
  r_r: number;    // Оставшееся время разгона (мс)
  p_s: number;    // Заданная мощность ШИМ (0..1000)
  p_c: number;    // Фактическая текущая мощность ШИМ (0..1000)
  w_t: number;    // Целевой заданный вес навески (г)
  w_c: number;    // Фактический текущий вес на весах (г)
  f: number;      // Мгновенный расход материала (г/с)
  z: number;      // Флаг ожидания обнуления (тары)
  sav: number;    // Флаг отправки записи параметров
  st: {
    run: number;  // Переменная "РАБОТА" (1 — цикл активен, 0 — остановлен)
    rem: number;  // Состояние дискретной линии удаленного управления
  };
}

interface CompanionPanelProps {
  telemetry: CompanionTelemetry;
  connectionStatus: ConnectionStatus;
  isSimulatorActive: boolean;
  availablePorts: string[];
  selectedPort: string;
  onPortSelect: (port: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  sendComm: (cmd: string) => void;
  onResetScale: () => void;
  unifiedCount: number;
  onClearUnified: () => void;
}

export default function CompanionPanel({
  telemetry,
  connectionStatus,
  isSimulatorActive,
  availablePorts,
  selectedPort,
  onPortSelect,
  onConnect,
  onDisconnect,
  sendComm,
  onResetScale,
  unifiedCount,
  onClearUnified
}: CompanionPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Вспомогательные вычисления для локального рендеринга
  const totalTimeSec = (telemetry.t_s / 1000).toFixed(1);
  const remTimeSec = (telemetry.t_r / 1000).toFixed(1);
  const timeProgress = telemetry.t_s > 0 ? (1 - telemetry.t_r / telemetry.t_s) * 100 : 0;
  
  const targetPowerPercent = (telemetry.p_s / 10).toFixed(0);
  const curPowerPercent = (telemetry.p_c / 10).toFixed(0);
  const powerProgress = (telemetry.p_c / 1000) * 100;

  const isCompleted = telemetry.w_c >= telemetry.w_t && telemetry.w_t > 0;
  const isRunning = telemetry.st.run === 1;

  return (
    <div id="companion-device-panel" className="bg-[#111318] border border-slate-800/50 rounded-2xl p-5 flex flex-col gap-5 shadow-sm">
      
      {/* Header and port selection */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/50 pb-3.5">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="font-sans font-bold text-sm tracking-tight text-white uppercase flex items-center gap-1.5">
              Контроллер Дозирования
              <span className="text-[10px] text-slate-500 font-mono font-normal">(Весы & ШИМ-Дозатор)</span>
            </h3>
            <p className="text-[10.5px] text-slate-500 leading-tight">Второй прибор на шине RS-485</p>
          </div>
        </div>

        {/* Real wire connection for device 2 */}
        {!isSimulatorActive && (
          <div className="flex items-center gap-1.5 bg-[#0A0B0D] p-1 rounded-lg border border-slate-800/50">
            <select
              value={selectedPort}
              onChange={(e) => onPortSelect(e.target.value)}
              className="bg-transparent font-mono text-slate-300 text-[11px] px-2 py-1 rounded focus:outline-none"
            >
              <option value="" className="bg-slate-900">Выбрать COM</option>
              {availablePorts.map((p) => (
                <option key={p} value={p} className="bg-slate-900">{p}</option>
              ))}
              {availablePorts.length === 0 && (
                <option value="COM6" className="bg-slate-900">COM6 (по умолч.)</option>
              )}
            </select>

            {connectionStatus === 'CONNECTED' ? (
              <button
                onClick={onDisconnect}
                className="bg-rose-950/35 hover:bg-rose-600 text-rose-300 hover:text-white px-2 py-1 text-[10px] font-bold rounded transition-all cursor-pointer"
              >
                ВЫКЛ
              </button>
            ) : (
              <button
                onClick={onConnect}
                disabled={connectionStatus === 'CONNECTING'}
                className="bg-indigo-950/35 hover:bg-indigo-600 text-indigo-300 hover:text-white px-2 py-1 text-[10px] font-bold rounded transition-all cursor-pointer disabled:opacity-50"
              >
                СВЯЗЬ
              </button>
            )}
          </div>
        )}

        {/* Simulator label if active */}
        {isSimulatorActive && (
          <div className="flex items-center gap-1.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] uppercase font-mono tracking-wider font-bold px-2 py-1 rounded-lg animate-pulse">
            <Cpu className="w-3.5 h-3.5" />
            <span>Симуляция Весов</span>
          </div>
        )}
      </div>

      {/* Primary LED Displays */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        
        {/* Massive digital weight scale */}
        <div className="bg-[#0D0E12] border border-slate-800/40 rounded-xl p-4 flex flex-col justify-center relative overflow-hidden">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1 block">Текущий вес смеси:</span>
          
          <div className="flex items-baseline justify-between transition-all">
            <span className={`font-mono text-3xl font-extrabold tracking-tight ${
              isCompleted 
                ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.15)]' 
                : isRunning 
                  ? 'text-indigo-400' 
                  : 'text-slate-300'
            }`}>
              {telemetry.w_c.toFixed(1)} <span className="text-sm font-normal text-slate-500">г</span>
            </span>
            <span className="text-xs font-mono text-slate-500">
              ЦЕЛЬ: <strong className="text-slate-300 font-bold">{telemetry.w_t.toFixed(1)} г</strong>
            </span>
          </div>

          {/* Quick zero / tare tool */}
          <button 
            onClick={onResetScale}
            className="absolute top-3 right-3 text-[10px] font-mono font-bold bg-slate-900/60 hover:bg-slate-800 border border-slate-800/50 px-2 py-0.5 rounded text-slate-400 hover:text-white transition cursor-pointer"
            title="Сбросить накопленный вес смеси"
          >
            ТАРА: 0.0г
          </button>

          {/* Progress gauge line */}
          <div className="w-full h-1 bg-slate-900 rounded-full mt-3 overflow-hidden">
            <div 
              className={`h-full transition-all duration-150 ${isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'}`}
              style={{ width: `${Math.min(100, (telemetry.w_c / (telemetry.w_t || 1)) * 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Liquid flow rate and timer readings */}
        <div className="bg-[#0D0E12] border border-slate-800/40 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-500 uppercase">
              <span>Скорость подачи:</span>
              <span>Истекает время:</span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="font-mono text-2xl font-bold text-slate-300 tracking-tight flex items-baseline gap-1">
                {telemetry.f.toFixed(1)}
                <span className="text-xs font-normal text-slate-500">г/сек</span>
              </span>
              <span className="font-mono text-xl font-bold text-sky-400 tracking-tight flex items-baseline gap-0.5">
                {remTimeSec} <span className="text-xs font-normal text-slate-500">секунд из {totalTimeSec}</span>
              </span>
            </div>
          </div>

          {/* Time progress bar */}
          <div className="w-full h-1 bg-slate-900 rounded-full mt-2 overflow-hidden">
            <div 
              className="h-full bg-sky-500 transition-all duration-150"
              style={{ width: `${timeProgress}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* PWM Controls and mechanical power status */}
      <div className="bg-[#0D0E12] border border-slate-800/40 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex justify-between items-center text-[10px] font-mono font-bold text-slate-500 uppercase">
          <span>Мощность дозатора (ШИМ):</span>
          <span className="text-slate-300">План: {targetPowerPercent}% | Исполнение: <strong className="text-indigo-400">{curPowerPercent}%</strong></span>
        </div>

        {/* Pulse Power bar */}
        <div className="w-full h-2.5 bg-slate-950 rounded-lg overflow-hidden relative border border-slate-900">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-sky-400 transition-all duration-150"
            style={{ width: `${powerProgress}%` }}
          ></div>
          {/* Target marker line */}
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-amber-500"
            style={{ left: `${(telemetry.p_s / 1000) * 100}%` }}
            title={`Уставка: ${targetPowerPercent}%`}
          ></div>
        </div>

        {/* Manual Target Slider */}
        <div className="flex items-center gap-3 mt-1.5">
          <input 
            type="range"
            min="0"
            max="1000"
            step="50"
            value={telemetry.p_s}
            onChange={(e) => sendComm(`P:${e.target.value}`)}
            className="flex-grow h-1 bg-slate-950 rounded-lg appearance-none cursor-ew-resize accent-indigo-500"
          />
          {/* Preset Buttons */}
          <div className="flex gap-1.5 font-mono text-[9px] font-bold">
            <button 
              onClick={() => sendComm("P:150")}
              className="px-1.5 py-0.5 rounded border border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:text-white transition cursor-pointer"
            >
              15%
            </button>
            <button 
              onClick={() => sendComm("P:500")}
              className="px-1.5 py-0.5 rounded border border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:text-white transition cursor-pointer"
            >
              50%
            </button>
            <button 
              onClick={() => sendComm("P:850")}
              className="px-1.5 py-0.5 rounded border border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:text-white transition cursor-pointer"
            >
              85%
            </button>
          </div>
        </div>
      </div>

      {/* Direct commands & Cycle status indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Play BUTTON */}
        <button
          onClick={() => sendComm("S:1")}
          disabled={isRunning}
          className={`py-2 px-4 rounded-xl text-xs font-bold font-mono tracking-wider flex items-center justify-center gap-2 transition uppercase shadow-sm cursor-pointer border ${
            isRunning 
              ? 'bg-slate-900 border-slate-800/50 text-slate-500' 
              : 'bg-emerald-600/10 hover:bg-emerald-600/95 border-emerald-500/20 hover:border-emerald-500 text-emerald-400 hover:text-white'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          СТАРТ ЦИКЛА
        </button>

        {/* STOP BUTTON */}
        <button
          onClick={() => sendComm("S:0")}
          disabled={!isRunning}
          className={`py-2 px-4 rounded-xl text-xs font-bold font-mono tracking-wider flex items-center justify-center gap-2 transition uppercase shadow-sm cursor-pointer border ${
            !isRunning 
              ? 'bg-slate-900 border-slate-800/50 text-slate-500' 
              : 'bg-rose-600/15 hover:bg-rose-600/95 border-rose-500/20 hover:border-rose-500 text-rose-450 hover:text-white'
          }`}
        >
          <Square className="w-3.5 h-3.5" />
          СТОП ЦИКЛА
        </button>

        {/* SAVE PARAMS */}
        <button
          onClick={() => sendComm("#SAVE")}
          className="py-2 px-4 bg-slate-900/60 hover:bg-slate-800 border border-slate-800/50 hover:border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold font-mono tracking-wider flex items-center justify-center gap-2 transition uppercase cursor-pointer"
        >
          <SaveIcon className="w-3.5 h-3.5 text-indigo-400" />
          ЗАПИСАТЬ EEPROM
        </button>
      </div>

      {/* SYNCHRONIZED LOGS CSV EXPORT CONTROL */}
      <div className="border-t border-slate-800/50 pt-4 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-amber-400 animate-pulse' : 'bg-slate-700'}`}></span>
          <span className="text-slate-450 font-mono">
            Автосборка данных: {unifiedCount > 0 ? (
              <strong className="text-emerald-400 font-bold">{unifiedCount} записей циклов</strong>
            ) : (
              <span className="text-slate-500 font-normal">ожидание старта цикла</span>
            )}
          </span>
        </div>

        {unifiedCount > 0 && (
          <button
            onClick={onClearUnified}
            className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-red-500/10 rounded-lg transition text-xs font-mono font-bold flex items-center gap-1 cursor-pointer"
            title="Сбросить совмещенный лог"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Очистить буфер
          </button>
        )}
      </div>
    </div>
  );
}
