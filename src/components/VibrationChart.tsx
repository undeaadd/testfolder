import React, { useRef, useEffect, useState } from 'react';
import { MeasurementPoint, VT27Mode, ParsedPacketMeta } from '../types';
import { 
  Play, 
  Pause, 
  ZoomIn, 
  ZoomOut, 
  Grid, 
  Eye, 
  EyeOff, 
  Save, 
  Cpu, 
  Check, 
  AlertCircle 
} from 'lucide-react';

interface VibrationChartProps {
  points: MeasurementPoint[];
  activeMode: VT27Mode;
  warnThreshold: number;
  dangerThreshold: number;
  isPaused: boolean;
  onTogglePause: () => void;
  onClearPoints: () => void;
  vibePacketMeta?: ParsedPacketMeta | null;
  isVibeConnected?: boolean;
  companionTelemetry?: any;
}

export default function VibrationChart({
  points,
  activeMode,
  warnThreshold,
  dangerThreshold,
  isPaused,
  onTogglePause,
  onClearPoints,
  vibePacketMeta,
  isVibeConnected = true,
  companionTelemetry
}: VibrationChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Пользовательские настройки отображения графиков
  const [zoomX, setZoomX] = useState<number>(1); // Коэффициент масштабирования по горизонтали (X): 1 = показать всё, 2+ = приближение временной шкалы
  const [showGrid, setShowGrid] = useState<boolean>(true); // Флаг видимости фоновой координатной сетки
  const [showThresholds, setShowThresholds] = useState<boolean>(true); // Флаг отображения линий предупредительной (WARN) и аварийной (CRIT) зон

  // Переключатели видимости отдельных измерительных каналов на осциллограмме
  const [visibleChannels, setVisibleChannels] = useState({
    vibe: true,     // Канал вибрации VT-27
    pwm: true,      // Канал мощности ШИМ дозатора
    weight: true,   // Канал текущего веса на весах
    accel: true,    // Канал виброускорения лотка дозатора
    time: true      // Канал отсчета времени цикла дозирования
  });

  // Функция переключения видимости канала
  const toggleChannel = (channel: keyof typeof visibleChannels) => {
    setVisibleChannels(prev => ({
      ...prev,
      [channel]: !prev[channel]
    }));
  };

  // Извлекаем последнюю зарегистрированную точку для вывода текущих параметров в легенду
  const lastPt = points.length > 0 ? points[points.length - 1] : null;

  // Форматирование текущего значения вибрации в строкус учетом активного режима
  const currentVibeValStr = lastPt 
    ? lastPt.value.toFixed(activeMode.code === 0x22 ? 0 : 2) 
    : '---';

  // Вычисление текущего процента ШИМ для телеметрии
  const currentPwmStr = lastPt?.doserPwm !== undefined 
    ? Math.round(lastPt.doserPwm / 10).toString() 
    : (companionTelemetry?.p_c !== undefined ? Math.round(companionTelemetry.p_c / 10).toString() : '---');

  // Определение текущего веса материала
  const currentWeightStr = lastPt?.doserWeight !== undefined 
    ? lastPt.doserWeight.toFixed(1) 
    : (companionTelemetry?.w_c !== undefined ? companionTelemetry.w_c.toFixed(1) : '---');

  // Вычисление косвенного виброускорения вибролотка дозатора
  const currentAccelStr = lastPt?.doserAccel !== undefined 
    ? lastPt.doserAccel.toFixed(1) 
    : (companionTelemetry?.st?.run === 1 && companionTelemetry?.p_c !== undefined 
        ? ((companionTelemetry.p_c / 1000) * 12.5 + 2.0).toFixed(1) 
        : '0.0');

  // Форматирование оставшегося времени цикла дозирования
  const currentTimeStr = lastPt?.doserTime !== undefined 
    ? (lastPt.doserTime / 1000).toFixed(1) 
    : (companionTelemetry?.t_r !== undefined ? (companionTelemetry.t_r / 1000).toFixed(1) : '---');

  // Перерисовка графиков при изменении точек данных, масштабирования или настроек отображения
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Оптимизация под экраны высокой плотности пикселей (High DPI / Retina)
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Заполнение фона глубоким темным индустриальным цветом
    ctx.fillStyle = '#0D0E12'; 
    ctx.fillRect(0, 0, width, height);

    if (points.length === 0) {
      // Рисуем заглушку при отсутствии данных измерений
      ctx.fillStyle = '#475569';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ОЖИДАНИЕ ДАННЫХ ИЗМЕРЕНИЙ...', width / 2, height / 2);
      return;
    }

    // Вычисляем количество отображаемых точек на основе масштаба ZoomX
    const maxPointsToDraw = Math.max(10, Math.floor(600 / zoomX));
    const drawnPoints = points.slice(-maxPointsToDraw);
    const count = drawnPoints.length;

    // Расчет лимитов по шкале Y для масштабирования основного канала вибрации
    const vibeValues = drawnPoints.map(p => p.value);
    const minValInDrawn = Math.min(...vibeValues, activeMode.minVal);
    const maxValInDrawn = Math.max(...vibeValues, activeMode.maxVal, dangerThreshold * 1.15);
    const vibeRange = maxValInDrawn - minValInDrawn || 1;

    // Вспомогательные функции для пересчета физических величин в пиксели экрана
    const getX = (index: number) => {
      if (count <= 1) return 50;
      return 50 + ((width - 70) * index) / (count - 1);
    };

    const getY = (normVal: number) => {
      const padding = 15;
      const usableHeight = height - 50;
      const clamped = Math.max(0, Math.min(1, normVal));
      return usableHeight + padding - (usableHeight - 10) * clamped;
    };

    // Отрисовка координатной сетки
    if (showGrid) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)'; // Полупрозрачные линии сетки
      ctx.lineWidth = 1;

      // Рисуем горизонтальные линии делений шкалы Y (всего 5 секций)
      const divisions = 5;
      for (let i = 0; i <= divisions; i++) {
        const val = minValInDrawn + (vibeRange * i) / divisions;
        const py = getY(i / divisions);
        
        ctx.beginPath();
        ctx.moveTo(45, py);
        ctx.lineTo(width - 15, py);
        ctx.stroke();

        // Числовые метки на левой оси Y
        ctx.fillStyle = '#64748b';
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(val.toFixed(activeMode.code === 0x22 ? 0 : 2), 40, py);
      }

      // Тонкие вертикальные маркеры времени
      const vertDivs = 8;
      for (let j = 1; j < vertDivs; j++) {
        const px = 50 + ((width - 70) * j) / vertDivs;
        ctx.beginPath();
        ctx.moveTo(px, 10);
        ctx.lineTo(px, height - 35);
        ctx.stroke();
      }
    }

    // Отрисовка пороговых линий предупреждения и аварии (ГОСТ)
    if (showThresholds && visibleChannels.vibe) {
      // Нормализуем уровень предупреждения под текущую шкалу Y канала вибрации
      const normWarn = (warnThreshold - minValInDrawn) / vibeRange;
      const pyWarn = getY(normWarn);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)'; // Оранжевая пунктирная линия
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(50, pyWarn);
      ctx.lineTo(width - 15, pyWarn);
      ctx.stroke();
      ctx.setLineDash([]); // Сброс
      ctx.fillStyle = 'rgba(245, 158, 11, 0.7)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('WARN', width - 20, pyWarn - 4);

      // Аварийный уровень критической вибрации
      const normDanger = (dangerThreshold - minValInDrawn) / vibeRange;
      const pyDanger = getY(normDanger);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)'; // Красная критическая линия
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(50, pyDanger);
      ctx.lineTo(width - 15, pyDanger);
      ctx.stroke();
      ctx.setLineDash([]); // Сброс
      ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
      ctx.fillText('CRIT', width - 20, pyDanger - 4);
    }

    // НАСТРОЙКА КРИВЫХ КАНАЛОВ ИЗМЕРЕНИЙ
    const channels = [
      // 1. Канал вибрации VT-27 (Виброперемещение, скорость, ускорение или обороты)
      { 
        key: 'vibe' as const, 
        valGetter: (p: MeasurementPoint) => (p.value - minValInDrawn) / vibeRange, 
        color: activeMode.color,
        lineWidth: 2.5
      },
      // 2. Уставка ШИМ-сигнала дозатора (коридор мощности от 0% до 100%)
      { 
        key: 'pwm' as const, 
        valGetter: (p: MeasurementPoint) => (p.doserPwm ?? 0) / 1000, 
        color: '#6366f1',
        lineWidth: 1.8
      },
      // 3. Текущий вес на весах (динамическая граница до уставки)
      { 
        key: 'weight' as const, 
        valGetter: (p: MeasurementPoint) => {
          const maxW = Math.max(300, companionTelemetry?.w_t ?? 200, p.doserWeight ?? 0);
          return (p.doserWeight ?? 0) / maxW;
        }, 
        color: '#10b981',
        lineWidth: 2.2
      },
      // 4. Оставшееся время технологического цикла укладки порции
      { 
        key: 'time' as const, 
        valGetter: (p: MeasurementPoint) => {
          const maxT = Math.max(15000, companionTelemetry?.t_s ?? 15005, p.doserTime ?? 0);
          return (p.doserTime ?? 0) / maxT;
        }, 
        color: '#ec4899',
        lineWidth: 1.5
      }
    ];

    // Отрисовка на Canva каждой активной линии графика в цикле
    channels.forEach(ch => {
      if (!visibleChannels[ch.key]) return;

      ctx.strokeStyle = ch.color;
      ctx.lineWidth = ch.lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(getX(0), getY(ch.valGetter(drawnPoints[0])));
      for (let i = 1; i < count; i++) {
        ctx.lineTo(getX(i), getY(ch.valGetter(drawnPoints[i])));
      }
      ctx.stroke();

      // Мягкий полупрозрачный градиент заливки под графиком вибрации
      if (ch.key === 'vibe') {
        const areaGrad = ctx.createLinearGradient(0, getY(1), 0, getY(0));
        areaGrad.addColorStop(0, `${ch.color}18`);
        areaGrad.addColorStop(1, `${ch.color}00`);
        ctx.lineTo(getX(count - 1), height - 35);
        ctx.lineTo(getX(0), height - 35);
        ctx.closePath();
        ctx.fillStyle = areaGrad;
        ctx.fill();
      }
    });

    // Опорная линия горизонтальной оси X
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(45, height - 35);
    ctx.lineTo(width - 15, height - 35);
    ctx.stroke();

    // Заполнение временных меток под шкалой времени
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    // Рисуем 3 ключевые временные метки (Начало полосы, Середина и Актуальное время)
    if (count >= 3) {
      const displayIndex = [0, Math.floor(count / 2), count - 1];
      displayIndex.forEach(idx => {
        const pt = drawnPoints[idx];
        const timeStr = pt.timestamp.toLocaleTimeString('ru-RU', { hour12: false }) + 
                        '.' + String(pt.timestamp.getMilliseconds()).padStart(3, '0');
        ctx.fillText(timeStr, getX(idx), height - 28);
      });
    }

  }, [points, activeMode, zoomX, showGrid, showThresholds, warnThreshold, dangerThreshold, visibleChannels, companionTelemetry]);

  // Экспорт файла графика как PNG снимка экрана в систему
  const handleExportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `process_scope_${Date.now()}.png`;
    link.href = url;
    link.click();
  };

  const lastMeta = vibePacketMeta;
  const hexString = lastMeta?.rawBytes
    ? lastMeta.rawBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
    : '---';

  const isCrcCorrect = lastMeta ? lastMeta.crcExpected === lastMeta.crcCalculated : true;

  return (
    <div id="oscilloscope-panel" className="bg-[#111318] border border-slate-800/50 rounded-2xl p-5 flex flex-col gap-4 shadow-sm h-full">
      {/* Верхний блок операций осциллографа */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/50 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
          <h3 className="font-sans font-bold text-sm tracking-tight text-white uppercase flex items-center gap-1.5">
            Анализ технологического процесса <span className="text-[10px] text-slate-500 font-mono font-normal">(Мультиосциллограф)</span>
          </h3>
        </div>

        {/* Панель оперативных кнопок */}
        <div className="flex flex-wrap items-center gap-2">
          {/* СТАРТ / ПАУЗА */}
          <button
            id="btn-toggle-pause"
            onClick={onTogglePause}
            className={`p-1.5 px-3 rounded-lg border transition-all duration-150 flex items-center gap-1.5 text-xs font-mono font-bold cursor-pointer ${
              isPaused
                ? 'bg-emerald-500/25 hover:bg-emerald-500/35 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-900/60 hover:bg-slate-800/40 border-slate-800/50 text-slate-300'
            }`}
            title={isPaused ? 'Запустить поток' : 'Приостановить отображение'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {isPaused ? 'СТАРТ' : 'ПАУЗА'}
          </button>

          <div className="w-[1px] h-4 bg-slate-800/50"></div>

          {/* Зумирование оси времени */}
          <div className="bg-[#0A0B0D] rounded-lg p-0.5 border border-slate-800/50 flex items-center gap-0.5">
            <button
              id="btn-zoom-out"
              onClick={() => setZoomX(prev => Math.max(1, prev - 0.5))}
              disabled={zoomX <= 1}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800/50 disabled:opacity-40 rounded transition cursor-pointer"
              title="Отдалить время (больше точек)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[10px] text-slate-300 font-bold px-1.5 min-w-[32px] text-center">
              {zoomX.toFixed(1)}x
            </span>
            <button
              id="btn-zoom-in"
              onClick={() => setZoomX(prev => Math.min(5, prev + 0.5))}
              disabled={zoomX >= 5}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800/50 disabled:opacity-40 rounded transition cursor-pointer"
              title="Приблизить время (меньше точек)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="w-[1px] h-4 bg-slate-800/50"></div>

          {/* Переключатель сетки */}
          <button
            id="btn-toggle-grid"
            onClick={() => setShowGrid(!showGrid)}
            className={`p-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${
              showGrid
                ? 'bg-[#1a1c24] hover:bg-[#252833] border-indigo-500/30 text-indigo-400'
                : 'bg-[#0A0B0D] hover:bg-slate-900/50 border-slate-800/50 text-slate-500'
            }`}
            title="Сетка"
          >
            <Grid className="w-4 h-4" />
          </button>

          {/* Переключатель аварийных границ по ГОСТ */}
          <button
            id="btn-toggle-thresholds"
            onClick={() => setShowThresholds(!showThresholds)}
            className={`p-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${
              showThresholds
                ? 'bg-[#1a1c24] hover:bg-[#252833] border-amber-500/30 text-amber-500'
                : 'bg-[#0A0B0D] hover:bg-slate-900/50 border-slate-800/50 text-slate-500'
            }`}
            title="Показать / скрыть границы"
          >
            {showThresholds ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          <div className="w-[1px] h-4 bg-slate-800/50"></div>

          {/* Экспорт графиков в PNG */}
          <button
            id="btn-export-graph-png"
            onClick={handleExportPNG}
            className="p-1.5 px-2.5 rounded-lg border bg-slate-900/60 hover:bg-slate-800/40 border-slate-800/60 hover:border-slate-700 text-slate-300 hover:text-white transition-all duration-150 flex items-center gap-1.5 text-xs font-medium cursor-pointer"
            title="Сохранить снимок графика как картинку"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">СНИМОК</span>
          </button>

          {/* Сброс буфера точек */}
          <button
            id="btn-clear-buffer"
            onClick={onClearPoints}
            className="px-2.5 py-1.5 text-xs text-rose-400 hover:text-white rounded-lg hover:bg-rose-950/20 transition duration-150 border border-transparent hover:border-rose-900/40 cursor-pointer"
          >
            ОЧИСТИТЬ
          </button>
        </div>
      </div>

      {/* Интерактивная легенда-переключатель с выводом значений в реальном времени */}
      <div className="flex flex-wrap items-center gap-2 pb-1 border-b border-slate-800/30 text-[11px] font-mono">
        <span className="text-[10px] font-sans font-bold text-slate-500 uppercase tracking-tight mr-1">Теги графиков:</span>
        
        {/* Канал вибрации */}
        <button
          onClick={() => toggleChannel('vibe')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition duration-150 cursor-pointer ${
            visibleChannels.vibe 
              ? 'bg-sky-500/10 text-sky-400 border-sky-500/30 shadow-sm' 
              : 'bg-slate-900/40 text-slate-600 border-transparent hover:text-slate-500'
          }`}
          title="Включить / отключить отображение Вибрации"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${visibleChannels.vibe ? 'animate-pulse' : ''}`} style={{ backgroundColor: activeMode.color }}></span>
          <span>ВИБР: {currentVibeValStr} {activeMode.unit}</span>
        </button>

        {/* ШИМ-мощность */}
        <button
          onClick={() => toggleChannel('pwm')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition duration-150 cursor-pointer ${
            visibleChannels.pwm 
              ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' 
              : 'bg-slate-900/40 text-slate-600 border-transparent hover:text-slate-500'
          }`}
          title="Включить / отключить отображение ШИМ импульсов"
        >
          <span className={`w-1.5 h-1.5 rounded-full bg-indigo-400 ${visibleChannels.pwm ? 'animate-pulse' : ''}`}></span>
          <span>ШИМ: {currentPwmStr}%</span>
        </button>

        {/* Текущая масса дозы */}
        <button
          onClick={() => toggleChannel('weight')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition duration-150 cursor-pointer ${
            visibleChannels.weight 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
              : 'bg-slate-900/40 text-slate-600 border-transparent hover:text-slate-500'
          }`}
          title="Включить / отключить отображение Веса дозирования"
        >
          <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${visibleChannels.weight ? 'animate-pulse' : ''}`}></span>
          <span>ВЕС: {currentWeightStr} г</span>
        </button>

        {/* Обратный отсчет цикла */}
        <button
          onClick={() => toggleChannel('time')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition duration-150 cursor-pointer ${
            visibleChannels.time 
              ? 'bg-pink-500/10 text-pink-400 border-pink-500/30 shadow-sm' 
              : 'bg-slate-900/40 text-slate-600 border-transparent hover:text-slate-500'
          }`}
          title="Включить / отключить отображение оставшегося времени цикла"
        >
          <span className={`w-1.5 h-1.5 rounded-full bg-pink-450 bg-pink-400 ${visibleChannels.time ? 'animate-pulse' : ''}`}></span>
          <span>ВРЕМЯ: {currentTimeStr} с</span>
        </button>
      </div>

      {/* Основная рабочая область осциллографа - на всю ширину панели */}
      <div className="w-full">
        {/* Окно осциллографа */}
        <div 
          ref={containerRef} 
          className="relative w-full h-[320px] md:h-[360px] border border-slate-800/40 rounded-xl overflow-hidden bg-[#0D0E12]"
        >
          <canvas
            id="osc-canvas"
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-crosshair block"
          />
          {isPaused && (
            <div className="absolute top-4 left-4 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold tracking-widest px-2.5 py-1 rounded-md animate-pulse">
              ПОТОК ЗАМОРОЖЕН (ПАУЗА)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
