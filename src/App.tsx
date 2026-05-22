import React, { useState, useEffect, useRef } from 'react';
import { 
  ConnectionStatus, 
  MeasurementPoint, 
  Stats, 
  SimulatorConfig, 
  LogMessage,
  ParsedPacketMeta
} from './types';
import { 
  VT27_MODES, 
  DEFAULT_MODE, 
  parsePacket, 
  buildPacketFrame, 
  generateMockValue 
} from './vt27Protocol';
import Header from './components/Header';
import VibrationChart from './components/VibrationChart';
import SimulatorControls from './components/SimulatorControls';
import SerialConsole from './components/SerialConsole';
import CompanionPanel, { CompanionTelemetry } from './components/CompanionPanel';
import { 
  ShieldAlert, 
  Info, 
  Cpu, 
  Radio, 
  Shield, 
  FileSpreadsheet, 
  Download, 
  Terminal, 
  Sliders, 
  AlertTriangle, 
  ShieldCheck,
  Disc,
  Volume2,
  Waves,
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart2,
  Database,
  Trash2
} from 'lucide-react';

const MAX_POINTS = 600;

// Default machine thresholds per mode
const DEFAULT_THRESHOLDS: Record<number, { warn: number; danger: number }> = {
  0x22: { warn: 3500, danger: 4800 },   // RPM об/мин (0..6000)
  0x23: { warn: 300, danger: 420 },     // Freq Гц (0..500)
  0x20: { warn: 2.5, danger: 4.0 },     // Disp мм (0..5.0)
  0x10: { warn: 55.0, danger: 80.0 },   // Accel м/с² (0..100)
  0x16: { warn: 4.5, danger: 7.1 }      // Velocity мм/с (0..80)
};

function extractPacketMeta(bytes: number[], isValid: boolean): ParsedPacketMeta | null {
  if (bytes.length !== 11) return null;
  const d1 = bytes[5] === 0x0A ? 0 : bytes[5];
  const d2 = bytes[6] === 0x0A ? 0 : bytes[6];
  const d3 = bytes[7] === 0x0A ? 0 : bytes[7];
  const d4 = bytes[8] === 0x0A ? 0 : bytes[8];
  const calculatedCrc = bytes.slice(1, 10).reduce((acc, curr) => acc + curr, 0) & 0xFF;
  return {
    rawBytes: bytes,
    length: bytes[1],
    dst: bytes[2],
    modeCode: bytes[3],
    digits: [d1, d2, d3, d4],
    scale: bytes[9],
    crcExpected: bytes[10],
    crcCalculated: calculatedCrc,
    isValid,
    timestamp: new Date()
  };
}

export default function App() {
  // --- СОСТОЯНИЕ ПОДКЛЮЧЕНИЙ К ПОРТАМ ---
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const [selectedPort, setSelectedPort] = useState<string>('COM5');
  const [connectionStatus2, setConnectionStatus2] = useState<ConnectionStatus>('DISCONNECTED');
  const [selectedPort2, setSelectedPort2] = useState<string>('COM6');
  const [availablePorts, setAvailablePorts] = useState<string[]>([]);
  const [isSimulatorActive, setIsSimulatorActive] = useState<boolean>(true); // Включен по умолчанию для наглядности интерфейса

  // --- НАСТРОЙКИ ЭКСПОРТА И ВИДИМОСТИ ОКОН ---
  const [logVibe, setLogVibe] = useState<boolean>(true);
  const [logDosing, setLogDosing] = useState<boolean>(true);
  const [showConsole, setShowConsole] = useState<boolean>(false); // Скрыта по умолчанию, открывается по кнопке сверху!

  // --- ТЕЛЕМЕТРИЯ С ВЕСОДОЗИРУЮЩЕГО КОНТРОЛЛЕРА ---
  const [companionTelemetry, setCompanionTelemetry] = useState<CompanionTelemetry>({
    t_s: 15000,
    t_r: 15000,
    r_s: 2000,
    r_r: 2000,
    p_s: 750,
    p_c: 0,
    w_t: 200.0,
    w_c: 0.0,
    f: 0.0,
    z: 0,
    sav: 0,
    st: { run: 0, rem: 1 }
  });

  // --- ХРАНИЛИЩЕ ОБЪЕДИНЕННОГО АРХИВА ДАННЫХ ---
  const [unifiedHistory, setUnifiedHistory] = useState<any[]>([]);
  const [vibePacketMeta, setVibePacketMeta] = useState<ParsedPacketMeta | null>(null);

  // Ссылки на аппаратные интерфейсы ведомого контроллера дозации
  const portRef2 = useRef<any>(null);
  const readerRef2 = useRef<any>(null);
  const keepReadingRef2 = useRef<boolean>(false);

  // Синхронизация реф-ссылки на телеметрию для параллельных цепочек промисов
  const companionTelemetryRef = useRef<CompanionTelemetry>(companionTelemetry);
  useEffect(() => {
    companionTelemetryRef.current = companionTelemetry;
  }, [companionTelemetry]);

  // --- СОСТОЯНИЕ ТОЧЕК ГРАФИКА И РЕЖИМА ---
  const [points, setPoints] = useState<MeasurementPoint[]>([]);
  const [activeModeCode, setActiveModeCode] = useState<number>(DEFAULT_MODE);
  const [warnThreshold, setWarnThreshold] = useState<number>(DEFAULT_THRESHOLDS[DEFAULT_MODE].warn);
  const [dangerThreshold, setDangerThreshold] = useState<number>(DEFAULT_THRESHOLDS[DEFAULT_MODE].danger);
  const [violationsCount, setViolationsCount] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // --- СТАТИСТИЧЕСКИЕ ДАННЫЕ СЕССИИ ---
  const [stats, setStats] = useState<Stats>({
    min: Infinity,
    max: -Infinity,
    avg: 0,
    count: 0
  });

  // --- БУФЕР ЛОГ-СООБЗЕНИЙ КОНСОЛИ ---
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [showHex, setShowHex] = useState<boolean>(true);

  // --- КОНФИГУРАЦИЯ ИМИТАТОРА ВИБРОСИГНАЛА ---
  const [simConfig, setSimConfig] = useState<SimulatorConfig>({
    isActive: true,
    modeCode: DEFAULT_MODE,
    signalType: 'sine',
    frequency: 1.2,
    amplitude: 2500, // Matching default mode (0x22 / RPM)
    noiseLevel: 50,
    rpmSpeed: 2800,
    packetRateMs: 150, // default update freq
    injectErrors: false
  });

  // --- ССЫЛКИ НА СЕРИЙНЫЙ ИНТЕРФЕЙС ВИБРОМЕТРА ---
  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const keepReadingRef = useRef<boolean>(false);

  // --- ТЕКУЩАЯ КОНФИГУРАЦИЯ ПРИБОРА ---
  const activeMode = VT27_MODES[activeModeCode];

  // Добавление строки в лог отладочной информации
  const addLogMessage = (direction: 'rx' | 'tx' | 'sys', bytes: number[], message: string, success: boolean = true) => {
    const newLog: LogMessage = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      direction,
      bytes,
      message,
      success
    };
    setLogs(prev => {
      // Keep last 150 log entries to prevent memory swelling
      const nextLogs = [...prev, newLog];
      if (nextLogs.length > 150) {
        return nextLogs.slice(-150);
      }
      return nextLogs;
    });
  };

  // --- ОБНОВЛЕНИЕ ПРЕДЕЛОВ ПРИ СМЕНЕ РЕЖИМА ---
  const handleSetModeAndThresholds = (modeCode: number) => {
    setActiveModeCode(modeCode);
    const defaults = DEFAULT_THRESHOLDS[modeCode] || { warn: 0, danger: 0 };
    setWarnThreshold(defaults.warn);
    setDangerThreshold(defaults.danger);
    
    // Синхронизация настроек имитатора сигнала под физические границы режима
    const modeMeta = VT27_MODES[modeCode];
    setSimConfig(prev => ({
      ...prev,
      modeCode,
      amplitude: modeMeta.maxVal * 0.45,
      noiseLevel: modeMeta.maxVal * 0.02
    }));

    // Очистка сессионной накопленной статистики для корректного пересчета значений
    handleClearStats();
  };

  const handleClearStats = () => {
    setStats({
      min: Infinity,
      max: -Infinity,
      avg: 0,
      count: 0
    });
    setViolationsCount(0);
  };

  const handleClearAllPoints = () => {
    setPoints([]);
    handleClearStats();
  };

  // --- ОБРАБОТКА НОВОГО ЗАМЕРА И ПЕРЕСЧЕТ СТАТИСТИКИ ---
  const processNewMeasurement = (point: MeasurementPoint) => {
    if (isPaused) return;

    // Регистрация выходов критических значений за аварийный или предупредительный пороги по ГОСТ
    if (point.value >= dangerThreshold || point.value >= warnThreshold) {
      setViolationsCount(prev => prev + 1);
    }

    const currentCompanion = companionTelemetryRef.current;
    const enrichedPoint: MeasurementPoint = {
      ...point,
      doserPwm: currentCompanion.p_c,
      doserWeight: currentCompanion.w_c,
      doserTime: currentCompanion.t_r,
      doserAccel: point.modeCode === 0x10 ? point.value : (currentCompanion.st.run === 1 ? (currentCompanion.p_c / 1000) * 12.5 + Math.random() * 1.5 : 0.0),
      feedRate: currentCompanion.f
    };

    setPoints(prev => {
      const nextPoints = [...prev, enrichedPoint];
      if (nextPoints.length > MAX_POINTS) {
        return nextPoints.slice(-MAX_POINTS);
      }
      return nextPoints;
    });

    setStats(prev => {
      const nextCount = prev.count + 1;
      const nextMin = Math.min(prev.min, point.value);
      const nextMax = Math.max(prev.max, point.value);
      const nextAvg = prev.count === 0 
        ? point.value 
        : (prev.avg * prev.count + point.value) / nextCount;

      return {
        min: nextMin,
        max: nextMax,
        avg: nextAvg,
        count: nextCount
      };
    });

    // Автоматическая буферизация совмещенного лога при активном статусе "РАБОТА" вибродозатора
    if (currentCompanion.st.run === 1) {
      setUnifiedHistory(prev => {
        const nextHist = [...prev, {
          timestamp: new Date(),
          vibeValue: point.value,
          vibeUnit: point.unit,
          vibeMode: point.modeName,
          t_s: currentCompanion.t_s,
          t_r: currentCompanion.t_r,
          p_s: currentCompanion.p_s,
          p_c: currentCompanion.p_c,
          w_t: currentCompanion.w_t,
          w_c: currentCompanion.w_c,
          f: currentCompanion.f,
          run: currentCompanion.st.run
        }];
        if (nextHist.length > 3000) {
          return nextHist.slice(-3000);
        }
        return nextHist;
      });
    }
  };

  // --- DEVICE SIMULATOR SCHEDURING TASK ---
  useEffect(() => {
    if (!isSimulatorActive) return;

    let timeElapsed = 0;
    const interval = setInterval(() => {
      // 1. Simulate VT-27 Vibration Analyzer (if simulator controls are on)
      if (simConfig.isActive) {
        timeElapsed += simConfig.packetRateMs / 1000;
        const simulateErr = simConfig.injectErrors && Math.random() < 0.15;
        const value = generateMockValue(simConfig, timeElapsed);
        
        // Form binary serial packet frame array representation
        const packetBytes = buildPacketFrame(activeModeCode, value, simulateErr);

        // Pass it through the absolute same decoder parser as a real physical sensor byte chunk would!
        const parsed = parsePacket(packetBytes);

        if (parsed) {
          const meta = extractPacketMeta(packetBytes, parsed.isValid);
          if (meta) setVibePacketMeta(meta);

          if (parsed.isValid) {
            const pt: MeasurementPoint = {
              timestamp: new Date(),
              value: parsed.value,
              modeCode: parsed.modeCode,
              modeName: activeMode.name,
              unit: activeMode.unit,
              isValid: true
            };
            processNewMeasurement(pt);

            addLogMessage(
              'rx', 
              packetBytes, 
              `${activeMode.name}: замер получен ${parsed.value.toFixed(2)} ${activeMode.unit}`
            );
          } else {
            addLogMessage(
              'rx', 
              packetBytes, 
              `Внимание: ошибка CRC контрольной суммы пакета [Sum Fail]`, 
              false
            );
          }
        }
      }

      // 2. Simulate Companion device (Weight scale / PWM controller dosing cycles)
      setCompanionTelemetry(prev => {
        if (prev.st.run === 1) {
          const elapsedSec = simConfig.packetRateMs / 1000;
          const nextTr = Math.max(0, prev.t_r - simConfig.packetRateMs);
          
          // Ramp up actual applied power towards target setting
          const rampStep = 45; // power increments per tick
          let nextPc = prev.p_c;
          if (prev.p_c < prev.p_s) {
            nextPc = Math.min(prev.p_s, prev.p_c + rampStep);
          } else if (prev.p_c > prev.p_s) {
            nextPc = Math.max(prev.p_s, prev.p_c - rampStep);
          }

          // Flow rate depends directly on current applied power index (0..1000)
          // 100% capacity gives ~16 g/s
          const baseFlow = (nextPc / 1000) * 16.0;
          const noise = (Math.random() - 0.5) * 0.45;
          const nextFlow = nextPc > 0 ? Math.max(0.1, baseFlow + noise) : 0;

          // Added mass to the scale bucket
          let nextWc = prev.w_c + nextFlow * elapsedSec;

          let runState = 1;
          // Stop conditions: either countdown reaches 0 OR scale target weight is reached
          if (nextTr <= 0 || nextWc >= prev.w_t) {
            runState = 0;
            if (nextWc >= prev.w_t) {
              nextWc = prev.w_t; // snap cleanly to target
            }
            nextPc = 0;
            addLogMessage('sys', [], `Имитатор ШИМ: Цикл дозирования завершен! Итоговый вес: ${nextWc.toFixed(1)} г`);
          }

          // Assemble real-looking periodic JSON line to push into general diagnostic console logs
          // Output rate to console is regulated using random so it is not too spammy
          if (Math.random() < 0.25) {
            const simulatedPayload = `{"seq":${prev.seq ?? 0},"t_s":${prev.t_s},"t_r":${nextTr},"r_s":${prev.r_s},"r_r":${Math.max(0, nextTr - 1500)},"p_s":${prev.p_s},"p_c":${nextPc},"w_t":${Math.round(prev.w_t * 10)},"w_c":${Math.round(nextWc * 10)},"f":${Math.round(nextFlow * 10)},"z":${prev.z},"sav":${prev.sav},"st":{"run":${runState},"rem":${prev.st.rem}}}`;
            
            // Calculate XOR + Rotate checksum mimicking parser.cpp
            let cs = 0;
            for (let i = 0; i < simulatedPayload.length; i++) {
              cs ^= simulatedPayload.charCodeAt(i);
              cs = ((cs << 1) | (cs >> 7)) & 0xFF;
            }
            const completeJson = `${simulatedPayload.slice(0, -1)},"cs":0x${cs.toString(16).toUpperCase()}}`;
            
            addLogMessage('rx', Array.from(new TextEncoder().encode(completeJson)), `RS-485 RX: ${completeJson}`);
          }

          return {
            ...prev,
            seq: (prev.seq ?? 0) + 1,
            t_r: nextTr,
            p_c: nextPc,
            f: nextFlow,
            w_c: nextWc,
            st: {
              ...prev.st,
              run: runState
            }
          };
        } else {
          return {
            ...prev,
            p_c: 0,
            f: 0
          };
        }
      });

    }, simConfig.packetRateMs);

    return () => clearInterval(interval);
  }, [isSimulatorActive, simConfig, activeModeCode]);

  // --- SCAN SYSTEM FOR COM SERIAL PORTS (BROWSER API) ---
  const scanSerialPorts = async () => {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      setAvailablePorts([]);
      return;
    }
    try {
      const ports = await (navigator as any).serial.getPorts();
      const portNames = ports.map((p: any, i: number) => `COM Port ${i + 1}`);
      setAvailablePorts(portNames);
    } catch (err: any) {
      console.error("Failed to fetch ports", err);
      addLogMessage(
        'sys', 
        [], 
        `Инфо: Настройки безопасности браузера ограничили опрос портов во фрейме предпросмотра (${err?.message || 'Security Policy'}). Если вам не удается подключить плату, пожалуйста, откройте приложение в обычной вкладке по кнопке "Open in a new tab" в верхнем правом углу Web Студии!`, 
        false
      );
    }
  };

  useEffect(() => {
    scanSerialPorts();
  }, []);

  // --- CONNECT TO REAL HARDWARE COM PORT ---
  const handleConnectHardware = async () => {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      addLogMessage('sys', [], 'Ваш браузер не поддерживает Web Serial API. Используйте Chrome/Edge или активируйте имитатор!', false);
      alert('Интерфейс Web Serial не поддерживается вашим веб-браузером. Пожалуйста, используйте Google Chrome, Microsoft Edge или Opera для связи с физическими COM портами, либо воспользуйтесь встроенным высокоточным Имитатором!');
      setConnectionStatus('ERROR');
      return;
    }

    setConnectionStatus('CONNECTING');
    addLogMessage('sys', [], `Инициализация соединения на порту ${selectedPort} с битрейтом 2400 бод...`);

    try {
      // Prompt user to select physical port
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 2400 });
      
      portRef.current = port;
      setConnectionStatus('CONNECTED');
      setIsSimulatorActive(false); // Disable simulator on successful real wire attach!
      addLogMessage('sys', [], `Соединение успешно установлено! Принимаем поток данных VT-27...`);

      // Start asynchronous read sequence loop
      keepReadingRef.current = true;
      readFromHardware(port);

    } catch (error: any) {
      console.error(error);
      setConnectionStatus('ERROR');
      const isSecurityError = error?.name === 'SecurityError' || error?.message?.includes('permissions policy') || error?.message?.includes('disallowed');
      const msg = isSecurityError 
        ? `Ошибка соединения (Permissions Policy): Браузер блокирует Web Serial в iframe. Нажмите кнопку "Open in a new tab" в верхнем правом углу экрана Студии и подключите устройство оттуда!`
        : `Ошибка соединения: ${error?.message || 'доступ запрещен или порт занят'}`;
      addLogMessage('sys', [], msg, false);
      if (isSecurityError) {
        alert('Доступ к Serial API заблокирован политикой безопасности iframe Студии. Для подключения платы откройте это приложение в новой вкладке (кнопка "Open in a new tab" в правом верхнем углу Студии), там всё заработает!');
      }
    }
  };

  const readFromHardware = async (port: any) => {
    const buffer: number[] = [];
    
    while (port.readable && keepReadingRef.current) {
      const reader = port.readable.getReader();
      readerRef.current = reader;

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            // Push incoming bytes
            for (let i = 0; i < value.length; i++) {
              buffer.push(value[i]);
            }

            // Parse valid packets out of the sliding buffer window
            while (buffer.length >= 11) {
              const headerIndex = buffer.indexOf(0x10);
              if (headerIndex === -1) {
                // No header, wipe buffer
                buffer.length = 0;
                break;
              }

              if (headerIndex > 0) {
                // Consumed/discarded garbage bytes prefixing header
                buffer.splice(0, headerIndex);
              }

              if (buffer.length >= 11) {
                // Slice candidate packet
                const packetCandidates = buffer.slice(0, 11);
                const parsed = parsePacket(packetCandidates);

                 if (parsed) {
                  const meta = extractPacketMeta(packetCandidates, parsed.isValid);
                  if (meta) setVibePacketMeta(meta);

                  if (parsed.isValid) {
                    const matchedMode = VT27_MODES[parsed.modeCode] || activeMode;
                    
                    // Sync active view selection with device state if it broadcasted a different measure mode!
                    if (parsed.modeCode !== activeModeCode) {
                      setActiveModeCode(parsed.modeCode);
                      const bounds = DEFAULT_THRESHOLDS[parsed.modeCode] || { warn: 0, danger: 0 };
                      setWarnThreshold(bounds.warn);
                      setDangerThreshold(bounds.danger);
                    }

                    const pt: MeasurementPoint = {
                      timestamp: new Date(),
                      value: parsed.value,
                      modeCode: parsed.modeCode,
                      modeName: matchedMode.name,
                      unit: matchedMode.unit,
                      isValid: true
                    };
                    processNewMeasurement(pt);

                    addLogMessage('rx', packetCandidates, `Устройство: получено значение ${parsed.value} ${matchedMode.unit}`);
                  } else {
                    addLogMessage('rx', packetCandidates, 'Контрольная сумма пакета разорвана, отбрасываем кадр', false);
                  }
                } else {
                  addLogMessage('rx', packetCandidates, 'Некорректная разметка структуры фрейма', false);
                }

                // Discard processed packet
                buffer.splice(0, 11);
              }
            }
          }
        }
      } catch (err: any) {
        console.error("Reader loop catch", err);
        addLogMessage('sys', [], `Потеря пакетов на линии: ${err?.message}`, false);
      } finally {
        reader.releaseLock();
      }
    }
  };

  const handleDisconnectHardware = async () => {
    keepReadingRef.current = false;
    addLogMessage('sys', [], 'Отключение от аппаратной линии связи...');

    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch (err) {}
    }

    if (portRef.current) {
      try {
        await portRef.current.close();
      } catch (err) {}
      portRef.current = null;
    }

    setConnectionStatus('DISCONNECTED');
    addLogMessage('sys', [], 'Линия связи отключена.');
  };

  // --- CONNECT TO COMPANION MOTOR CONTROL HARDWARE ---
  const handleConnectCompanion = async () => {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      addLogMessage('sys', [], 'Ваш браузер не поддерживает Web Serial API. Используйте Chrome/Edge или активируйте имитатор!', false);
      alert('Интерфейс Web Serial не поддерживается вашим веб-браузером. Пожалуйста, используйте Google Chrome, Microsoft Edge или Opera для связи!');
      setConnectionStatus2('ERROR');
      return;
    }

    setConnectionStatus2('CONNECTING');
    addLogMessage('sys', [], `Инициализация соединения с контроллером весов на порту ${selectedPort2} при 115200 бод (RS-485)...`);

    try {
      // Prompt user to select physical port
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 }); // High-speed telemetry
      
      portRef2.current = port;
      setConnectionStatus2('CONNECTED');
      setIsSimulatorActive(false); // disable simulator automatically
      addLogMessage('sys', [], `Контроллер дозирования успешно подключен! Чтение данных запущено...`);

      keepReadingRef2.current = true;
      readFromCompanion(port);

    } catch (error: any) {
      console.error(error);
      setConnectionStatus2('ERROR');
      const isSecurityError = error?.name === 'SecurityError' || error?.message?.includes('permissions policy') || error?.message?.includes('disallowed');
      const msg = isSecurityError 
        ? `Ошибка соединения (Permissions Policy): Браузер блокирует Web Serial в iframe Студии. Нажмите "Open in a new tab" в правом верхнем углу Студии, чтобы подключить контроллер дозирования!`
        : `Ошибка связи с контроллером: ${error?.message || 'доступ запрещен или порт занят'}`;
      addLogMessage('sys', [], msg, false);
      if (isSecurityError) {
        alert('Доступ к Serial API ограничен политикой безопасности iframe Студии. Для подключения контроллера весов откройте приложение в новой вкладке (кнопка "Open in a new tab" в правом верхнем углу Студии), и кликните СВЯЗЬ там!');
      }
    }
  };

  const readFromCompanion = async (port: any) => {
    let lineBuffer = "";
    const decoder = new TextDecoder();

    while (port.readable && keepReadingRef2.current) {
      const reader = port.readable.getReader();
      readerRef2.current = reader;

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          if (value) {
            lineBuffer += decoder.decode(value, { stream: true });
            let newlineIndex;
            while ((newlineIndex = lineBuffer.indexOf('\n')) !== -1) {
              const line = lineBuffer.slice(0, newlineIndex).trim();
              lineBuffer = lineBuffer.slice(newlineIndex + 1);
              if (line) {
                try {
                  // Clean HEX checksum to support parsed strict integers representation
                  const cleanLine = line.replace(/"cs":\s*0x([0-9A-Fa-f]+)/g, (_, hex) => `"cs":${parseInt(hex, 16)}`);

                  // Print raw lines in diagnostic tracer console
                  addLogMessage('rx', Array.from(value), `RS-485 RX: ${line}`);

                  const parsed = JSON.parse(cleanLine);
                  if (parsed) {
                    processCompanionTelemetry(parsed);
                  }
                } catch (err) {
                  console.error("Payload decoding failure", line, err);
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.error("Companion port reader loop exception", err);
      } finally {
        reader.releaseLock();
      }
    }
  };

  const processCompanionTelemetry = (parsed: any) => {
    setCompanionTelemetry(prev => {
      // Create clone
      const updated = { ...prev };

      if (typeof parsed.seq === 'number') updated.seq = parsed.seq;
      if (typeof parsed.t_s === 'number') updated.t_s = parsed.t_s;
      if (typeof parsed.t_r === 'number') updated.t_r = parsed.t_r;
      if (typeof parsed.r_s === 'number') updated.r_s = parsed.r_s;
      if (typeof parsed.r_r === 'number') updated.r_r = parsed.r_r;
      if (typeof parsed.p_s === 'number') updated.p_s = parsed.p_s;
      if (typeof parsed.p_c === 'number') updated.p_c = parsed.p_c;

      // Extract weight division multipliers (x10) from firmware output into actual gram coordinates
      if (typeof parsed.w_t === 'number') updated.w_t = parsed.w_t / 10.0;
      if (typeof parsed.w_c === 'number') updated.w_c = parsed.w_c / 10.0;
      if (typeof parsed.f === 'number') updated.f = parsed.f / 10.0;
      if (typeof parsed.z === 'number') updated.z = parsed.z;
      if (typeof parsed.sav === 'number') updated.sav = parsed.sav;

      if (parsed.st && typeof parsed.st === 'object') {
        updated.st = {
          run: typeof parsed.st.run === 'number' ? parsed.st.run : prev.st.run,
          rem: typeof parsed.st.rem === 'number' ? parsed.st.rem : prev.st.rem,
        };
      }

      // Merge delta arrays if nested inside "d" Object
      if (parsed.d && typeof parsed.d === 'object') {
        const delta = parsed.d;
        if (typeof delta.t_s === 'number') updated.t_s = delta.t_s;
        if (typeof delta.t_r === 'number') updated.t_r = delta.t_r;
        if (typeof delta.r_s === 'number') updated.r_s = delta.r_s;
        if (typeof delta.r_r === 'number') updated.r_r = delta.r_r;
        if (typeof delta.p_s === 'number') updated.p_s = delta.p_s;
        if (typeof delta.p_c === 'number') updated.p_c = delta.p_c;

        if (typeof delta.w_t === 'number') updated.w_t = delta.w_t / 10.0;
        if (typeof delta.w_c === 'number') updated.w_c = delta.w_c / 10.0;
        if (typeof delta.f === 'number') updated.f = delta.f / 10.0;
        if (typeof delta.z === 'number') updated.z = delta.z;
        if (typeof delta.sav === 'number') updated.sav = delta.sav;

        if (delta.st && typeof delta.st === 'object') {
          updated.st = {
            run: typeof delta.st.run === 'number' ? delta.st.run : updated.st.run,
            rem: typeof delta.st.rem === 'number' ? delta.st.rem : updated.st.rem,
          };
        }
      }

      return updated;
    });
  };

  const handleDisconnectCompanion = async () => {
    keepReadingRef2.current = false;
    addLogMessage('sys', [], 'Отключение от контроллера дозирования...');

    if (readerRef2.current) {
      try {
        await readerRef2.current.cancel();
      } catch (err) {}
    }

    if (portRef2.current) {
      try {
        await portRef2.current.close();
      } catch (err) {}
      portRef2.current = null;
    }

    setConnectionStatus2('DISCONNECTED');
    addLogMessage('sys', [], 'Контроллер весов отключен от шины.');
  };

  // --- SEND DIRECT RAW COMMAND TO COMPANION DEVICE 2 ---
  const sendCompanionCommand = async (command: string) => {
    const formattedCmd = command.endsWith('\n') ? command : `${command}\n`;
    addLogMessage('tx', Array.from(new TextEncoder().encode(formattedCmd)), `RS-485 TX -> ${command.trim()}`);

    if (isSimulatorActive) {
      // Handle simulated response immediately in the browser UI
      if (command.startsWith('S:')) {
        const runVal = parseInt(command.slice(2), 10);
        setCompanionTelemetry(prev => {
          // If starting, zero the container scale to simulate freshly poured material of cycle
          const nextWc = runVal === 1 ? 0 : prev.w_c;
          return {
            ...prev,
            st: { ...prev.st, run: runVal },
            w_c: nextWc,
            t_r: runVal === 1 ? prev.t_s : prev.t_r
          };
        });
        addLogMessage('sys', [], `Имитатор ШИМ: Цикл ${runVal === 1 ? 'СТАРТОВАЛ' : 'ОСТАНОВЛЕН'}`);
      } 
      else if (command.startsWith('P:')) {
        const powerVal = parseInt(command.slice(2), 10);
        setCompanionTelemetry(prev => ({ ...prev, p_s: powerVal }));
        addLogMessage('sys', [], `Имитатор ШИМ: Новая уставка мощности равна ${powerVal}`);
      } 
      else if (command === '#SAVE') {
        addLogMessage('sys', [], 'Имитатор EEPROM: Настройки прибора сохранены энергонезависимо!');
        // Simulated ACK response
        setTimeout(() => {
          addLogMessage('rx', Array.from(new TextEncoder().encode('{"ack":"saved"}')), 'RS-485 RX: {"ack":"saved"}');
        }, 150);
      }
      return;
    }

    if (portRef2.current && connectionStatus2 === 'CONNECTED') {
      try {
        const writer = portRef2.current.writable.getWriter();
        await writer.write(new TextEncoder().encode(formattedCmd));
        writer.releaseLock();
      } catch (err: any) {
        console.error("Write exception on Device 2 port:", err);
        addLogMessage('sys', [], `Ошибка передачи команды: ${err?.message}`, false);
      }
    } else {
      addLogMessage('sys', [], `Ошибка: Устройство 2 не готово. Команда '${command.trim()}' проигнорирована.`, false);
    }
  };

  // Download CSV helper
  const downloadCSV = (headers: string[], rows: any[][], fileName: string) => {
    // Format with semicolon separators (traditional for Russian Excel formats)
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + 
      [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export selected CSV based on dual toggles in the top panel
  const handleExportSelectedCSV = () => {
    if (logVibe && logDosing) {
      if (unifiedHistory.length === 0) {
        alert('Нет совмещенных данных цикла для экспорта! Пожалуйста, запустите цикл дозирования при активных виброизмерениях, чтобы накопить данные.');
        return;
      }
      const headers = [
        'Время UTC', 
        'Виброметр (Показание)', 
        'Единица', 
        'Режим измерения', 
        'Общее время (мс)', 
        'Оставшееся время (мс)', 
        'ШИМ уставка (0-1000)', 
        'ШИМ факт (0-1000)', 
        'Заданный вес (г)', 
        'Текущий вес (г)', 
        'Расход (г/с)', 
        'Состояние цикла'
      ];
      const rows = unifiedHistory.map(item => [
        item.timestamp instanceof Date ? item.timestamp.toISOString() : new Date(item.timestamp).toISOString(),
        item.vibeValue,
        item.vibeUnit,
        item.vibeMode,
        item.t_s,
        item.t_r,
        item.p_s,
        item.p_c,
        item.w_t,
        item.w_c,
        item.f,
        item.run === 1 ? 'РАБОТА' : 'СТОП'
      ]);
      downloadCSV(headers, rows, `combined_telemetry_${new Date().toISOString().slice(0, 10)}.csv`);
      addLogMessage('sys', [], 'Успешный экспорт: Совмещенный CSV файл сохранен.');
    } else if (logVibe) {
      if (points.length === 0) {
        alert('Нет зарегистрированных показаний виброметра для экспорта!');
        return;
      }
      const headers = ['Время UTC', 'Показание', 'Единица', 'Режим измерения'];
      const rows = points.map(item => [
        item.timestamp instanceof Date ? item.timestamp.toISOString() : new Date(item.timestamp).toISOString(),
        item.value,
        item.unit,
        item.modeName
      ]);
      downloadCSV(headers, rows, `vibe_vt27_telemetry_${new Date().toISOString().slice(0, 10)}.csv`);
      addLogMessage('sys', [], 'Успешный экспорт: Лог виброметра VT-27 сохранен.');
    } else if (logDosing) {
      if (unifiedHistory.length === 0) {
        alert('Нет накопленных показаний цикла дозирования для экспорта! Пожалуйста, запустите цикл дозирования, чтобы накопить данные.');
        return;
      }
      const headers = [
        'Время UTC', 
        'Общее время (мс)', 
        'Оставшееся время (мс)', 
        'ШИМ уставка (0-1000)', 
        'ШИМ факт (0-1000)', 
        'Заданный вес (г)', 
        'Текущий вес (г)', 
        'Расход (г/с)', 
        'Состояние цикла'
      ];
      const rows = unifiedHistory.map(item => [
        item.timestamp instanceof Date ? item.timestamp.toISOString() : new Date(item.timestamp).toISOString(),
        item.t_s,
        item.t_r,
        item.p_s,
        item.p_c,
        item.w_t,
        item.w_c,
        item.f,
        item.run === 1 ? 'РАБОТА' : 'СТОП'
      ]);
      downloadCSV(headers, rows, `vibe_feeder_telemetry_${new Date().toISOString().slice(0, 10)}.csv`);
      addLogMessage('sys', [], 'Успешный экспорт: Лог вибродозатора (весов) сохранен.');
    } else {
      alert('Пожалуйста, выберите хотя бы один фильтр записи логов (Виброметр / Вибродозатор)!');
    }
  };

  // Consolidation helpers for joint VT-27 dashboard section
  const formatStatVal = (val: number) => {
    if (val === Infinity || val === -Infinity || isNaN(val)) return '---';
    return val.toFixed(activeModeCode === 0x22 ? 1 : 3);
  };

  const getModeIcon = (code: number) => {
    switch (code) {
      case 0x22: return <Disc className="w-4.5 h-4.5" />;
      case 0x23: return <Activity className="w-4.5 h-4.5" />;
      case 0x20: return <Waves className="w-4.5 h-4.5" />;
      case 0x10: return <ShieldAlert className="w-4.5 h-4.5" />;
      case 0x16: return <Volume2 className="w-4.5 h-4.5" />;
      default: return <Activity className="w-4.5 h-4.5" />;
    }
  };

  // Determine current alarm status of VT-27 for styling status tag and level bar
  const currentVibeVal = points[points.length - 1]?.value || 0.0;
  let severity: 'normal' | 'warning' | 'danger' = 'normal';
  if (currentVibeVal >= dangerThreshold) {
    severity = 'danger';
  } else if (currentVibeVal >= warnThreshold) {
    severity = 'warning';
  }

  const getSeverityStyle = () => {
    switch (severity) {
      case 'danger':
        return {
          bg: 'bg-rose-500/10 border-rose-500/25 text-rose-400',
          label: 'АВАРИЯ / CRIT',
          icon: <ShieldAlert className="w-4 h-4 text-rose-400 animate-bounce" />,
          barBg: 'bg-rose-500 shadow-md shadow-rose-500/40'
        };
      case 'warning':
        return {
          bg: 'bg-amber-500/10 border-amber-500/25 text-amber-400',
          label: 'ПРЕДУПРЕЖДЕНИЕ',
          icon: <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />,
          barBg: 'bg-amber-500 shadow-md shadow-amber-500/40'
        };
      default:
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
          label: 'НОРМА / OK',
          icon: <Shield className="w-4 h-4 text-emerald-400" />,
          barBg: 'bg-emerald-500'
        };
    }
  };
  const statusStyle = getSeverityStyle();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 flex flex-col justify-between selection:bg-sky-500/30 selection:text-sky-200">
      
      {/* HEADER SECTION */}
      <Header
        connectionStatus={connectionStatus}
        isSimulatorActive={isSimulatorActive}
        onToggleSimulator={() => {
          if (isSimulatorActive) {
            setIsSimulatorActive(false);
            addLogMessage('sys', [], 'Режим имитатора отключен. Ожидание аппаратных сигналов.');
          } else {
            handleDisconnectHardware();
            setIsSimulatorActive(true);
            setConnectionStatus('DISCONNECTED');
            addLogMessage('sys', [], 'Имитатор VT-27 активирован. Генерируем тестовый поток.');
          }
        }}
        onRefreshPorts={scanSerialPorts}
        availablePorts={availablePorts}
        selectedPort={selectedPort}
        onPortSelect={setSelectedPort}
        onConnect={handleConnectHardware}
        onDisconnect={handleDisconnectHardware}
      />

      {/* DETAILED INFORMATION NOTE ROW */}
      <div className="bg-zinc-900 border-b border-zinc-900 px-6 py-2.5 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2 text-zinc-400">
          <Info className="w-4 h-4 text-sky-400 flex-shrink-0" />
          <span>
            {isSimulatorActive 
              ? 'Запущен режим высокоточного имитатора. Изменяйте параметры ползунками ниже для проверки!' 
              : `Опрос аппаратного виброанализатора на порту ${selectedPort} при скорости 2400 бит/с.`}
          </span>
        </div>
        <div className="hidden md:flex items-center gap-4 text-zinc-500">
          <span className="flex items-center gap-1"><Radio className="w-3.5 h-3.5" /> Modbus ASCII/VT</span>
          <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> ISO 10816 ГОСТ</span>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <main className="flex-grow p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full">
        
        {/* TOP PANEL: CSV GENERATION & DEBUG TOGGLE */}
        <div id="top-logger-config-panel" className="bg-[#111318] border border-slate-800/50 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-sans font-bold text-white uppercase tracking-tight">
                  Генерация и экспорт логов датчиков (CSV)
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Выберите каналы для записи. При активации обоих фильтров экспортируется совмещенный архив (2-в-1).
              </p>
            </div>
            
            {/* Toggles for log items */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                id="btn-toggle-log-vibe"
                onClick={() => setLogVibe(!logVibe)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition duration-200 border cursor-pointer ${
                  logVibe 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-sm' 
                    : 'bg-[#0A0B0D] text-slate-500 border-slate-800/50 hover:text-slate-400'
                }`}
              >
                <span className={`w-2 h-2 rounded-full transition duration-200 ${logVibe ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-slate-750'}`}></span>
                Виброметр VT-27
              </button>

              <button
                id="btn-toggle-log-dosing"
                onClick={() => setLogDosing(!logDosing)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition duration-200 border cursor-pointer ${
                  logDosing 
                    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/40 shadow-sm' 
                    : 'bg-[#0A0B0D] text-slate-500 border-slate-800/50 hover:text-slate-400'
                }`}
              >
                <span className={`w-2 h-2 rounded-full transition duration-200 ${logDosing ? 'bg-indigo-400 animate-pulse shadow-[0_0_8px_#6366f1]' : 'bg-slate-750'}`}></span>
                Вибродозатор (Весы)
              </button>
            </div>

            {/* Downloader and terminal trigger buttons */}
            <div className="flex items-center gap-2">
              <button
                id="btn-global-download-csv"
                onClick={handleExportSelectedCSV}
                disabled={!logVibe && !logDosing}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-900/60 disabled:text-slate-600 border border-emerald-500/25 disabled:border-slate-800/50 text-white px-4 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase cursor-pointer disabled:cursor-not-allowed transition duration-150 shadow-sm"
              >
                <Download className="w-4 h-4" />
                Скачать CSV
              </button>

              <button
                id="btn-global-toggle-console"
                onClick={() => setShowConsole(!showConsole)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition duration-150 cursor-pointer ${
                  showConsole 
                    ? 'bg-indigo-950/40 text-indigo-300 border-indigo-500/40' 
                    : 'bg-zinc-900/60 hover:bg-zinc-800/40 text-zinc-400 border-slate-800/50 hover:text-white'
                }`}
              >
                <Terminal className="w-4 h-4 text-indigo-400" />
                <span>{showConsole ? 'Скрыть отладку' : 'Консоль отладки'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 1: UNIFIED VIBRATION ANALYZER (VT-27) */}
        <div id="unified-vibration-block" className="bg-[#111318]/45 border border-slate-800/40 rounded-3xl p-5 md:p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800/50 pb-4 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-sky-400" />
                <h3 className="font-sans font-bold text-base tracking-tight text-white uppercase">
                  Первичный Виброанализатор VT-27
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                Регистрация спектральных вибропараметров ротора в реальном времени по ГОСТ ISO 10816
              </p>
            </div>
          </div>

          {/* Unified Workspace Panel Card */}
          <div className="bg-[#111318] border border-slate-800/50 rounded-2xl p-6 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Column (Digital Display, Gauge Bar & Modes) - 7/12 width */}
              <div className="lg:col-span-7 flex flex-col justify-between gap-6">
                
                {/* Mode description header and Status Tag */}
                <div className="flex items-start justify-between border-b border-slate-800/20 pb-4">
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block mb-1">
                      Текущий режим измерения
                    </span>
                    <h2 className="text-lg font-bold font-sans text-white tracking-tight flex items-center gap-2">
                      <span style={{ color: activeMode.color }}>
                        {getModeIcon(activeMode.code)}
                      </span>
                      {activeMode.name}
                    </h2>
                  </div>
                  
                  {/* Status Tag */}
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono font-bold ${statusStyle.bg}`}>
                    {statusStyle.icon}
                    <span>{statusStyle.label}</span>
                  </div>
                </div>

                {/* Digital Readout Indicator Container */}
                <div className="py-4 text-center relative bg-[#0D0E12] rounded-xl border border-slate-800/40 p-5">
                  <div className="absolute top-1.5 left-3 font-mono text-[9px] text-[#4f5864] uppercase tracking-widest">
                    vt-27 digit indicator
                  </div>
                  <div className="inline-block relative">
                    <span 
                      className="text-7xl font-mono font-extrabold tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.02)] block select-all"
                      style={{ color: activeMode.color }}
                    >
                      {(points[points.length - 1]?.value || 0.0).toFixed(activeModeCode === 0x22 ? 1 : 3)}
                    </span>
                    <span className="absolute bottom-1 -right-16 font-mono text-slate-400 font-bold text-lg tracking-wide uppercase">
                      {activeMode.unit}
                    </span>
                  </div>
                </div>

                {/* Bargraph Gauge level status line */}
                <div>
                  <div className="flex items-center justify-between text-[11px] font-mono mb-2">
                    <span className="text-slate-500">Диапазон: {activeMode.minVal} .. {activeMode.maxVal} {activeMode.unit}</span>
                    <div className="flex gap-4">
                      <span className="text-amber-500/70">Предупр: &ge;{warnThreshold.toFixed(1)}</span>
                      <span className="text-rose-500/70">Крит: &ge;{dangerThreshold.toFixed(1)}</span>
                    </div>
                  </div>
                  
                  <div className="h-4 bg-[#0D0E12] border border-slate-800/40 rounded-full overflow-hidden p-0.5 flex gap-[#1px] relative">
                    {/* Warning boundary marker strip */}
                    <div 
                      style={{ left: `${((warnThreshold - activeMode.minVal) / (activeMode.maxVal - activeMode.minVal)) * 100}%` }}
                      className="absolute top-0 bottom-0 w-[2px] bg-amber-500/60 z-10"
                      title="Граница предупреждения"
                    ></div>
                    {/* Danger boundary marker strip */}
                    <div 
                      style={{ left: `${((dangerThreshold - activeMode.minVal) / (activeMode.maxVal - activeMode.minVal)) * 100}%` }}
                      className="absolute top-0 bottom-0 w-[2px] bg-rose-500/60 z-10"
                      title="Граница опасности"
                    ></div>

                    {/* Gauge actual strip filler */}
                    <div 
                      className={`h-full rounded-full transition-all duration-100 ${statusStyle.barBg}`}
                      style={{ width: `${Math.min(100, Math.max(0, (((points[points.length - 1]?.value || 0.0) - activeMode.minVal) / (activeMode.maxVal - activeMode.minVal)) * 100))}%` }}
                    ></div>
                  </div>
                </div>

                {/* Vibration modes quick selection grids */}
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-widest text-[#4f5864] block mb-2 px-0.5">
                    {isSimulatorActive ? 'Режимы виброметра (кликом в симуляторе)' : 'Режимы датчика виброметра'}
                  </span>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                    {Object.values(VT27_MODES).map((mode) => {
                      const isSelected = mode.code === activeModeCode;
                      return (
                        <button
                          key={mode.code}
                          id={`mode-btn-${mode.code}`}
                          onClick={() => handleSetModeAndThresholds(mode.code)}
                          disabled={!isSimulatorActive}
                          className={`py-2 px-1 rounded-lg text-center transition-all duration-150 flex flex-col items-center gap-1 border cursor-pointer ${
                            isSelected
                              ? 'bg-[#181a20] border-slate-600 text-white shadow-sm'
                              : isSimulatorActive
                                ? 'bg-[#0A0B0D] hover:bg-[#181a20] border border-slate-850 hover:border-slate-750 text-slate-400 hover:text-white'
                                : 'bg-[#0A0B0D]/30 border border-slate-900/10 text-slate-600 cursor-not-allowed'
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

              {/* Right Column (Statistics panel & Calibration bounds configs) - 5/12 width */}
              <div className="lg:col-span-5 lg:border-l border-slate-800/50 lg:pl-8 flex flex-col justify-between gap-6">
                
                {/* Integrated Statistics Container */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800/30 pb-2.5">
                    <div className="flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-emerald-450" />
                      <h4 className="font-sans font-bold text-xs uppercase tracking-tight text-slate-200">
                        Статистика замеров
                      </h4>
                    </div>
                    <button
                      id="btn-unified-reset-stats"
                      onClick={handleClearStats}
                      className="text-[10px] uppercase font-mono tracking-wider font-bold text-rose-400 hover:text-rose-350 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 rounded border border-rose-500/20 transition-all duration-150 cursor-pointer"
                    >
                      Сброс
                    </button>
                  </div>

                  {/* Stats numbers 2x2 bento list */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Minimum value segment */}
                    <div className="bg-[#0D0E12] border border-slate-800/40 rounded-xl p-2.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono font-bold uppercase mb-0.5">
                        <span>Мин</span>
                        <ArrowDown className="w-3 h-3 text-emerald-500" />
                      </div>
                      <div>
                        <span className="text-base font-mono font-bold text-emerald-400">
                          {formatStatVal(stats.min)}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono ml-1">{activeMode.unit}</span>
                      </div>
                    </div>

                    {/* Maximum value segment */}
                    <div className="bg-[#0D0E12] border border-slate-800/40 rounded-xl p-2.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono font-bold uppercase mb-0.5">
                        <span>Макс</span>
                        <ArrowUp className="w-3 h-3 text-rose-500" />
                      </div>
                      <div>
                        <span className="text-base font-mono font-bold text-rose-400">
                          {formatStatVal(stats.max)}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono ml-1">{activeMode.unit}</span>
                      </div>
                    </div>

                    {/* Average value segment */}
                    <div className="bg-[#0D0E12] border border-slate-800/40 rounded-xl p-2.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono font-bold uppercase mb-0.5">
                        <span>Среднее</span>
                        <Activity className="w-3 h-3 text-indigo-400" />
                      </div>
                      <div>
                        <span className="text-base font-mono font-bold text-indigo-400">
                          {formatStatVal(stats.avg)}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono ml-1">{activeMode.unit}</span>
                      </div>
                    </div>

                    {/* Measurements count segment */}
                    <div className="bg-[#0D0E12] border border-slate-800/40 rounded-xl p-2.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono font-bold uppercase mb-0.5">
                        <span>Замеров</span>
                        <Database className="w-3 h-3 text-slate-450" />
                      </div>
                      <div>
                        <span className="text-base font-mono font-bold text-slate-300">
                          {stats.count}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono ml-1">точек</span>
                      </div>
                    </div>
                  </div>

                  {/* Threshold breaches line status indicator */}
                  <div className="flex items-center justify-between text-[11px] font-mono bg-[#0D0E12]/50 border border-slate-800/30 p-2 rounded-xl">
                    <div className="flex items-center gap-1.55">
                      <ShieldCheck className={`w-3.5 h-3.5 ${violationsCount > 0 ? 'text-amber-500 animate-pulse' : 'text-emerald-500'}`} />
                      <span className="text-slate-400">Нарушения норм:</span>
                    </div>
                    <span className={`font-bold font-mono ${violationsCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {violationsCount} раз
                    </span>
                  </div>
                </div>

                {/* Integrated Sliders Form configurations */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-800/30 pb-2">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    <span className="font-sans font-bold text-xs uppercase text-slate-200">Настройка порогов</span>
                  </div>
                  
                  <div className="space-y-3">
                    {/* WARN CALIBRATION SLIDER */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="flex items-center gap-1 font-bold uppercase text-amber-500 text-[10px]">
                          <AlertTriangle className="w-3 h-3" />
                          WARN (Предупр):
                        </span>
                        <span className="font-bold text-white bg-[#0D0E12] px-1.5 py-0.5 rounded border border-slate-800/40 text-[10px]">
                          {warnThreshold.toFixed(1)} {activeMode.unit}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={activeMode.minVal}
                        max={activeMode.maxVal}
                        step={activeMode.maxVal / 100}
                        value={warnThreshold}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setWarnThreshold(val);
                          setDangerThreshold(Math.max(val, dangerThreshold));
                        }}
                        className="w-full h-1 bg-[#0D0E12] rounded-lg appearance-none cursor-ew-resize accent-amber-500"
                      />
                    </div>

                    {/* CRIT CALIBRATION SLIDER */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="flex items-center gap-1 font-bold uppercase text-rose-500 text-[10px]">
                          <ShieldCheck className="w-3 h-3" />
                          CRIT (Авария):
                        </span>
                        <span className="font-bold text-white bg-[#0D0E12] px-1.5 py-0.5 rounded border border-slate-800/40 text-[10px]">
                          {dangerThreshold.toFixed(1)} {activeMode.unit}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={activeMode.minVal}
                        max={activeMode.maxVal}
                        step={activeMode.maxVal / 100}
                        value={dangerThreshold}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setDangerThreshold(val);
                          setWarnThreshold(Math.min(val, warnThreshold));
                        }}
                        className="w-full h-1 bg-[#0D0E12] rounded-lg appearance-none cursor-ew-resize accent-rose-500"
                      />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <div className="grid grid-cols-1">
            <VibrationChart
              points={points}
              activeMode={activeMode}
              warnThreshold={warnThreshold}
              dangerThreshold={dangerThreshold}
              isPaused={isPaused}
              onTogglePause={() => setIsPaused(!isPaused)}
              onClearPoints={handleClearAllPoints}
              vibePacketMeta={vibePacketMeta}
              isVibeConnected={connectionStatus === 'CONNECTED' || isSimulatorActive}
              companionTelemetry={companionTelemetry}
            />
          </div>
        </div>

        {/* SECTION 2: COMPANION DOSING CONTROL & VIBRATORY FEEDER */}
        <div id="companion-dosing-section" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <CompanionPanel
              telemetry={companionTelemetry}
              connectionStatus={connectionStatus2}
              isSimulatorActive={isSimulatorActive}
              availablePorts={availablePorts}
              selectedPort={selectedPort2}
              onPortSelect={setSelectedPort2}
              onConnect={handleConnectCompanion}
              onDisconnect={handleDisconnectCompanion}
              sendComm={sendCompanionCommand}
              onResetScale={() => {
                setCompanionTelemetry(prev => ({ ...prev, w_c: 0.0 }));
                addLogMessage('sys', [], 'Весы обнулены (сброс тары к 0.0 г).');
              }}
              unifiedCount={unifiedHistory.length}
              onClearUnified={() => {
                setUnifiedHistory([]);
                addLogMessage('sys', [], 'Совмещенный буфер логов очищен.');
              }}
            />
          </div>

          <div className="lg:col-span-1">
            {isSimulatorActive ? (
              <SimulatorControls
                config={simConfig}
                activeMode={activeMode}
                onChange={(updated) => setSimConfig(prev => ({ ...prev, ...updated }))}
              />
            ) : (
              <div id="sim-hidden-inactive-placeholder" className="bg-[#111318]/50 border border-slate-800/30 rounded-2xl p-6 text-center flex flex-col items-center justify-center h-full min-h-[220px]">
                <Cpu className="w-10 h-10 text-slate-700 mb-3" />
                <h4 className="text-slate-500 font-bold text-xs uppercase tracking-wider">Прямой опрос Аппаратуры</h4>
                <p className="text-slate-650 text-[10.5px] mt-2 max-w-xs leading-normal font-mono">
                  Имитатор сигналов скрыт. Вы подключены и принимаете физические пакеты данных RS-485.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: FULL-WIDTH BOTTOM DEBUG CONSOLE */}
        {showConsole && (
          <div id="full-width-debug-console" className="w-full mt-4">
            <SerialConsole
              logs={logs}
              onClearLogs={() => setLogs([])}
              showHex={showHex}
              onToggleHex={() => setShowHex(!showHex)}
            />
          </div>
        )}
      </main>

      {/* FOOTER CRUTCH */}
      <footer id="app-footer" className="border-t border-zinc-900 bg-zinc-950 p-4 text-center text-xs text-zinc-600 font-mono flex flex-col sm:flex-row sm:justify-between sm:px-8 gap-2">
        <span>© 2026 Аппаратно-Программный Комплекс «Вибродиагностика VT-27»</span>
        <span>Разработано в соответствии с ГОСТ для контроля вибрации машин и роторов</span>
      </footer>
    </div>
  );
}
