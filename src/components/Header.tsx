import React, { useEffect, useState } from 'react';
import { ConnectionStatus } from '../types';
import { Activity, ShieldAlert, Cpu, HardDrive, RefreshCw } from 'lucide-react';

interface HeaderProps {
  connectionStatus: ConnectionStatus;
  isSimulatorActive: boolean;
  onToggleSimulator: () => void;
  onRefreshPorts: () => void;
  availablePorts: string[];
  selectedPort: string;
  onPortSelect: (port: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function Header({
  connectionStatus,
  isSimulatorActive,
  onToggleSimulator,
  onRefreshPorts,
  availablePorts,
  selectedPort,
  onPortSelect,
  onConnect,
  onDisconnect
}: HeaderProps) {
  const [time, setTime] = useState<string>(new Date().toISOString().slice(11, 19));

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getStatusColor = () => {
    if (isSimulatorActive) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    switch (connectionStatus) {
      case 'CONNECTED': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'CONNECTING': return 'text-sky-400 animate-pulse bg-sky-500/10 border-sky-500/30';
      case 'ERROR': return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      default: return 'text-zinc-400 bg-zinc-800 border-zinc-700/50';
    }
  };

  const getStatusLabel = () => {
    if (isSimulatorActive) return 'СИМУЛЯТОР';
    switch (connectionStatus) {
      case 'CONNECTED': return 'СОЕДИНЕНО';
      case 'CONNECTING': return 'ПОДКЛЮЧЕНИЕ';
      case 'ERROR': return 'ОШИБКА ПОРТА';
      default: return 'ОТКЛЮЧЕНО';
    }
  };

  return (
    <header id="app-header" className="border-b border-slate-800/50 bg-[#111318] px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      {/* Логотип и Описание АПК */}
      <div className="flex items-center gap-3">
        <div className="bg-indigo-500/15 border border-indigo-500/30 rounded-lg p-2.5 text-indigo-400 font-bold">
          <Activity className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-sans font-bold text-xl tracking-tight text-white uppercase flex items-center gap-1.5">
              <span className="text-indigo-400 font-extrabold">VT-27</span> Analyzer
            </h1>
            <span className="text-[10px] bg-slate-800/50 text-slate-400 font-mono tracking-wider px-1.5 py-0.5 rounded border border-slate-700/30">
              v2.1
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">Виброанализатор & Тахометр реального времени</p>
        </div>
      </div>

      {/* Панель выбора режимов и портов */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Выбор имитационного или физического режима связи */}
        <div className="bg-slate-900/60 border border-slate-800/50 p-1 rounded-lg flex items-center gap-1">
          <button
            id="btn-toggle-sim"
            onClick={onToggleSimulator}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
              isSimulatorActive
                ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/40 font-semibold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Имитатор
          </button>
          
          <div className="h-4 w-[1px] bg-slate-800/50"></div>

          <button
            id="btn-toggle-hw"
            onClick={() => {
              if (isSimulatorActive) onToggleSimulator();
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
              !isSimulatorActive
                ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/40 font-semibold'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            COM-Устройство
          </button>
        </div>

        {/* Параметры связи с реальным COM-портом устройства */}
        {!isSimulatorActive && (
          <div className="flex items-center gap-2 bg-[#111318]/90 border border-slate-800/50 rounded-lg p-1">
            <select
              id="port-selector"
              value={selectedPort}
              onChange={(e) => onPortSelect(e.target.value)}
              className="bg-[#0A0B0D] font-mono text-slate-300 text-xs px-2.5 py-1.5 rounded-md border border-slate-800/50 focus:outline-none focus:border-indigo-500"
            >
              <option value="">-- Выбрать COM-порт --</option>
              {availablePorts.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
              {availablePorts.length === 0 && (
                <option value="COM5">COM5 (по умолч.)</option>
              )}
            </select>

            <button
              id="btn-refresh-ports"
              onClick={onRefreshPorts}
              title="Обновить список портов"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-md transition-all duration-150"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {connectionStatus === 'CONNECTED' ? (
              <button
                id="btn-hardware-disconnect"
                onClick={onDisconnect}
                className="bg-[#31151a] hover:bg-rose-600/80 border border-rose-500/40 hover:border-rose-500 text-rose-300 hover:text-white px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150"
              >
                Отключить
              </button>
            ) : (
              <button
                id="btn-hardware-connect"
                onClick={onConnect}
                disabled={connectionStatus === 'CONNECTING'}
                className="bg-indigo-650/20 hover:bg-indigo-600 border border-indigo-500/30 hover:border-indigo-500 text-indigo-300 hover:text-white px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 disabled:opacity-50"
              >
                {connectionStatus === 'CONNECTING' ? 'Связь...' : 'Подключить'}
              </button>
            )}
          </div>
        )}

        {/* Лампочка текущего статуса */}
        <div className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold tracking-wide flex items-center gap-1.5 ${getStatusColor()}`}>
          <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
          {getStatusLabel()}
        </div>

        {/* Системное время */}
        <div className="hidden lg:flex items-center gap-1 bg-slate-900/30 border border-slate-800/50 rounded-lg px-3 py-1.5 text-slate-400 text-xs font-mono">
          <span>UTC {time}</span>
        </div>
      </div>
    </header>
  );
}
