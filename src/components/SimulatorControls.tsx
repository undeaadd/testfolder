import React from 'react';
import { SimulatorConfig, VT27Mode } from '../types';
import { Settings, RefreshCw, ZapOff, CheckCircle2 } from 'lucide-react';

interface SimulatorControlsProps {
  config: SimulatorConfig;
  activeMode: VT27Mode;
  onChange: (newConfig: Partial<SimulatorConfig>) => void;
}

export default function SimulatorControls({
  config,
  activeMode,
  onChange
}: SimulatorControlsProps) {
  if (!config.isActive) {
    return (
      <div id="sim-inactive-placeholder" className="bg-[#111318] border border-dashed border-slate-800/60 rounded-2xl p-6 text-center flex flex-col items-center justify-center h-full min-h-[220px]">
        < ZapOff className="w-10 h-10 text-slate-600 mb-3" />
        <h4 className="text-slate-400 font-bold text-sm tracking-tight uppercase">Имитатор VT-27 выключен</h4>
        <p className="text-slate-600 text-xs mt-1 max-w-sm">
          Система ожидает получения пакетов от реального аппаратного COM-порта вашего компьютера.
        </p>
      </div>
    );
  }

  const signalTypes: { value: 'sine' | 'triangle' | 'square' | 'noise'; label: string }[] = [
    { value: 'sine', label: 'Синусоида' },
    { value: 'triangle', label: 'Треугольник' },
    { value: 'square', label: 'Меандр' },
    { value: 'noise', label: 'Случ. шум' },
  ];

  return (
    <div id="sim-controls-panel" className="bg-[#111318] border border-slate-800/50 rounded-2xl p-5 flex flex-col justify-between h-full gap-5">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-800/50 pb-3">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-indigo-400 animate-spin-slow" />
          <h3 className="font-sans font-bold text-sm tracking-tight text-white uppercase">Параметры имитатора</h3>
        </div>
        <div className="flex items-center gap-1 bg-indigo-505/10 text-indigo-300 border border-indigo-500/30 text-[10px] uppercase font-mono tracking-wider font-bold px-2 py-0.5 rounded">
          <CheckCircle2 className="w-3 h-3 text-indigo-400" />
          <span>Симуляция Активна</span>
        </div>
      </div>

      {/* Сетка регуляторов параметров */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 my-auto text-xs font-mono">
        {/* Тип формы генерируемого сигнала */}
        <div className="flex flex-col gap-2">
          <label className="text-slate-400 font-bold uppercase">Форма сигнала:</label>
          <div className="grid grid-cols-2 gap-1.5">
            {signalTypes.map((type) => (
              <button
                key={type.value}
                id={`sim-type-${type.value}`}
                onClick={() => onChange({ signalType: type.value })}
                disabled={activeMode.code === 0x22} // Блокировка выбора формы сигнала в режиме оборотов (RPM)
                className={`py-1.5 px-2 rounded text-[10px] text-center transition-all ${
                  config.signalType === type.value
                    ? 'bg-indigo-600/35 border border-indigo-500/40 text-indigo-300 font-bold shadow-sm'
                    : 'bg-[#0A0B0D] border border-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800/40 disabled:opacity-30'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
          {activeMode.code === 0x22 && (
            <span className="text-[9px] text-slate-500 italic mt-0.5">
              * Заблокировано для режима RPM
            </span>
          )}
        </div>

        {/* Регулятор амплитуды / оборотов */}
        <div className="flex flex-col gap-2">
          {activeMode.code === 0x22 ? (
            <>
              <div className="flex justify-between text-slate-400">
                <span className="font-bold uppercase">Обороты:</span>
                <span className="text-indigo-400 font-bold">{config.rpmSpeed} об/мин</span>
              </div>
              <input
                id="slider-rpm"
                type="range"
                min="0"
                max="6000"
                step="50"
                value={config.rpmSpeed}
                onChange={(e) => onChange({ rpmSpeed: parseInt(e.target.value, 10) })}
                className="w-full h-1 bg-[#0A0B0D] rounded-lg appearance-none cursor-ew-resize accent-indigo-500"
              />
            </>
          ) : (
            <>
              <div className="flex justify-between text-slate-400">
                <span className="font-bold uppercase">Амплитуда:</span>
                <span className="text-indigo-400 font-bold">{config.amplitude.toFixed(2)}</span>
              </div>
              <input
                id="slider-amplitude"
                type="range"
                min="0.1"
                max={activeMode.maxVal}
                step={activeMode.maxVal / 100}
                value={config.amplitude}
                onChange={(e) => onChange({ amplitude: parseFloat(e.target.value) })}
                className="w-full h-1 bg-[#0A0B0D] rounded-lg appearance-none cursor-ew-resize accent-indigo-500"
              />
            </>
          )}
        </div>

        {/* Регулировки шума и частоты синусоиды */}
        <div className="flex flex-col gap-4">
          {/* Частота периодического процесса */}
          {activeMode.code !== 0x22 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-slate-400">
                <span className="font-bold uppercase">Частота волны:</span>
                <span className="text-slate-300 font-bold">{config.frequency.toFixed(1)} Гц</span>
              </div>
              <input
                id="slider-freq"
                type="range"
                min="0.1"
                max="15"
                step="0.1"
                value={config.frequency}
                onChange={(e) => onChange({ frequency: parseFloat(e.target.value) })}
                className="w-full h-1 bg-[#0A0B0D] rounded-lg appearance-none cursor-ew-resize accent-slate-500"
              />
            </div>
          )}

          {/* Генерация случайного белого шума датчика */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-slate-400">
              <span className="font-bold uppercase">Уровень шума:</span>
              <span className="text-slate-300 font-bold">{config.noiseLevel.toFixed(2)}</span>
            </div>
            <input
              id="slider-noise"
              type="range"
              min="0"
              max={activeMode.maxVal / 15}
              step={activeMode.maxVal / 150 || 0.05}
              value={config.noiseLevel}
              onChange={(e) => onChange({ noiseLevel: parseFloat(e.target.value) })}
              className="w-full h-1 bg-[#0A0B0D] rounded-lg appearance-none cursor-ew-resize accent-slate-500"
            />
          </div>
        </div>

        {/* Настройка таймера получения пакетов и искажения данных */}
        <div className="flex flex-col gap-4">
          {/* Периодичность отправки (мс) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-slate-400">
              <span className="font-bold uppercase">Период опроса:</span>
              <span className="text-slate-300 font-bold">{config.packetRateMs} мс</span>
            </div>
            <input
              id="slider-rate"
              type="range"
              min="50"
              max="1000"
              step="50"
              value={config.packetRateMs}
              onChange={(e) => onChange({ packetRateMs: parseInt(e.target.value, 10) })}
              className="w-full h-1 bg-[#0A0B0D] rounded-lg appearance-none cursor-ew-resize accent-slate-500"
            />
          </div>

          {/* Переключатель генерации преднамеренных ошибок CRC */}
          <div className="flex items-center gap-2 mt-1">
            <input
              id="checkbox-inject-errors"
              type="checkbox"
              checked={config.injectErrors}
              onChange={(e) => onChange({ injectErrors: e.target.checked })}
              className="rounded border-slate-800 bg-[#0A0B0D] text-indigo-500 focus:ring-0 focus:ring-offset-0 w-4 h-4 cursor-pointer accent-indigo-500"
            />
            <label htmlFor="checkbox-inject-errors" className="text-[11px] text-slate-450 cursor-pointer font-bold select-none uppercase">
              Ломать CRC (Периодич.)
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
