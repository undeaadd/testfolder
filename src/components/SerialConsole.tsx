import React, { useRef, useEffect } from 'react';
import { LogMessage } from '../types';
import { Terminal, Trash2, ShieldAlert, CheckCircle } from 'lucide-react';

interface SerialConsoleProps {
  logs: LogMessage[];
  onClearLogs: () => void;
  showHex: boolean;
  onToggleHex: () => void;
}

export default function SerialConsole({
  logs,
  onClearLogs,
  showHex,
  onToggleHex
}: SerialConsoleProps) {
  const terminalRef = useRef<HTMLDivElement | null>(null);

  // Автоматическая прокрутка терминала вниз при поступлении новых сообщений
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const formatByte = (b: number, hex: boolean) => {
    if (hex) {
      return b.toString(16).toUpperCase().padStart(2, '0');
    }
    return b.toString(10).padStart(3, '0');
  };

  return (
    <div id="serial-terminal-panel" className="bg-[#111318] border border-slate-800/50 rounded-2xl p-5 flex flex-col h-[280px] md:h-[350px] gap-3 shadow-sm">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-800/50 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400 animate-pulse" />
          <h3 className="font-sans font-bold text-sm tracking-tight text-white uppercase">Консоль отладки шины (RS-485)</h3>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          {/* Format selector */}
          <button
            id="btn-toggle-hex"
            onClick={onToggleHex}
            className="text-[10px] font-mono font-bold border border-slate-800/50 bg-[#0A0B0D] hover:bg-slate-800/40 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg transition duration-150"
          >
            ФОРМАТ: {showHex ? 'HEX' : 'DEC'}
          </button>
          
          <div className="w-[1px] h-4 bg-slate-800/50"></div>

          {/* Clear terminal logs */}
          <button
            id="btn-clear-logs"
            onClick={onClearLogs}
            className="p-1 px-1.5 text-slate-400 hover:text-rose-450 font-mono text-xs flex items-center gap-1 rounded hover:bg-slate-900/40 transition"
            title="Очистить лог сообщений"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">СБРОС</span>
          </button>
        </div>
      </div>

      {/* Terminal View area */}
      <div 
        ref={terminalRef}
        id="terminal-scroller"
        className="flex-grow overflow-y-auto bg-[#0D0E12] font-mono text-xs p-3.5 rounded-lg border border-slate-800/50 flex flex-col gap-1.5 scrollbar-thin scrollbar-thumb-slate-800"
      >
        {logs.length === 0 ? (
          <div className="my-auto text-center text-slate-600 italic">
            Нет активности на шине. Запустите имитатор или подключите устройство.
          </div>
        ) : (
          logs.map((log) => {
            const dateStr = log.timestamp.toISOString().slice(11, 23);
            const isRx = log.direction === 'rx';
            const payloadBytes = log.bytes;

            return (
              <div 
                key={log.id} 
                className={`flex flex-col sm:flex-row sm:items-start gap-1 p-1 px-1.5 rounded transition ${
                  log.success 
                    ? 'hover:bg-slate-900/35 text-slate-300' 
                    : 'bg-rose-950/25 text-rose-300 border border-rose-900/30'
                }`}
              >
                {/* Stamp & Mode */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-slate-500 text-[10px] min-w-[75px]">{dateStr}</span>
                  <span className={`text-[10px] font-bold px-1 py-0.2 rounded font-mono ${
                    log.direction === 'rx' 
                      ? 'bg-emerald-500/10 text-emerald-400' 
                      : log.direction === 'tx'
                        ? 'bg-indigo-500/15 text-indigo-400'
                        : 'bg-slate-800 text-slate-400'
                  }`}>
                    {log.direction.toUpperCase()}
                  </span>
                </div>

                {/* Квадратики байтов пакета */}
                {payloadBytes.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1 flex-grow">
                    {payloadBytes.map((b, idx) => {
                      // Цветовое выделение ключевых служебных байтов
                      const isHeader = idx === 0 && b === 0x10;
                      const isMode = idx === 3;
                      const isCRC = idx === 10;
                      
                      let colorClass = 'text-slate-400';
                      if (isHeader) colorClass = 'text-sky-400 font-bold';
                      else if (isMode) colorClass = 'text-amber-500 font-bold';
                      else if (isCRC) colorClass = log.success ? 'text-emerald-450 font-bold' : 'text-rose-500 font-bold animate-pulse';

                      return (
                        <span 
                          key={idx}
                          title={`Байт ${idx}: ${isHeader ? 'Заголовок (Header)' : isMode ? 'Код измерения (CMD)' : isCRC ? 'Контрольная сумма (CRC)' : 'Данные (Data)'}`} 
                          className={`px-1 rounded bg-[#0A0B0D] border border-slate-850 text-[10px] ${colorClass}`}
                        >
                          {formatByte(b, showHex)}
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                {/* Text Explanation */}
                <span className="text-slate-400 break-all sm:text-right mt-0.5 sm:mt-0 font-medium ml-auto flex items-center gap-1">
                  {!log.success && <ShieldAlert className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />}
                  {log.success && isRx && <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                  <span className="text-slate-500">{log.message}</span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
