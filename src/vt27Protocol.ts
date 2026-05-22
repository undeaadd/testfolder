import { VT27Mode, SimulatorConfig } from './types';

// Определение поддерживаемых прибором VT-27 физических величин, их кодов, диапазонов и визуального цвета.
export const VT27_MODES: Record<number, VT27Mode> = {
  0x22: { code: 0x22, name: "Частота вращения", unit: "об/мин", color: "#38bdf8", minVal: 0, maxVal: 6000 },
  0x23: { code: 0x23, name: "Частота", unit: "Гц", color: "#f97316", minVal: 0, maxVal: 500 },
  0x20: { code: 0x20, name: "Виброперемещение", unit: "мм", color: "#4ade80", minVal: 0, maxVal: 5.0 },
  0x10: { code: 0x10, name: "Виброускорение", unit: "м/с²", color: "#c084fc", minVal: 0, maxVal: 100.0 },
  0x16: { code: 0x16, name: "Виброскорость", unit: "мм/с", color: "#facc15", minVal: 0, maxVal: 80.0 }
};

// Режим по умолчанию при инициализации системы (Частота вращения - 0x22)
export const DEFAULT_MODE = 0x22;

/**
 * Очистка BCD цифры от служебного заполнителя.
 * В протоколе VT-27 символ нуля при передаче кодируется как 0x0A (или 10 в десятичной системе).
 */
export function cleanDigit(d: number): number {
  return d === 0x0A || d === 10 ? 0 : d;
}

/**
 * Парсер входящего бинарного пакета VT-27 длинной ровно 11 байт.
 * 
 * Структура пакета Modbus-подобного кадра прибора:
 * Byte 0: Префикс заголовка (всегда 0x10 - DF1 Header)
 * Byte 1: Длина оставшейся части сообщения (0x0A = 10 байт)
 * Byte 2: Адрес назначения DST (обычно 0xFF - широковещательный или локальный)
 * Byte 3: Код физического параметра измерения (CMD / Режим работы)
 * Byte 4: Резервный байт / Экстра
 * Byte 5..8: Цифры разрядов BCD (Digit_1, Digit_2, Digit_3, Digit_4)
 * Byte 9: Показатель экспоненты степени 10 для сдвига десятичной точки (множитель)
 * Byte 10: Контрольная сумма CRC (сумма байт с 1 по 9 по модулю 256)
 */
export function parsePacket(packet: number[]): { value: number; modeCode: number; isValid: boolean } | null {
  // Проверяем соответствие длины пакета и префикса кадра
  if (packet.length !== 11) return null;
  if (packet[0] !== 0x10) return null;
  
  // Вычисляем контрольную сумму со 2-го по 10-й байт (индексы 1..9 включительно)
  const sum = packet.slice(1, 10).reduce((acc, curr) => acc + curr, 0) & 0xFF;
  const expectedCrc = packet[10];
  const isValid = sum === expectedCrc;

  const modeCode = packet[3];
  
  // Извлекаем разряды BCD, пропуская через декодер символа "0" -> 0x0A
  const d1 = cleanDigit(packet[5]);
  const d2 = cleanDigit(packet[6]);
  const d3 = cleanDigit(packet[7]);
  const d4 = cleanDigit(packet[8]);
  
  // Собираем базовое четырехзначное число
  const rawVal = d1 * 1000 + d2 * 100 + d3 * 10 + d4;
  
  // Применяем сдвиг десятичной запятой (множитель экспоненты)
  const scaleExponent = packet[9];
  const value = rawVal / Math.pow(10, scaleExponent);
  
  return { value, modeCode, isValid };
}

/**
 * Функция утилиты для упаковки вещественного числа обратно в 4 BCD-цифры и показатель экспоненты.
 * Требуется для симуляции реального прибора и верификации алгоритмов.
 * Например: 123.4 -> цифры [1, 2, 3, 4], степень 1, значение = 1234 / 10 = 123.4
 */
export function encodeValue(value: number): { digits: number[]; scale: number } {
  const rounded = Math.abs(value);
  if (rounded === 0) {
    return { digits: [0x0A, 0x0A, 0x0A, 0x0A], scale: 1 };
  }
  
  let scale = 0;
  let tempVal = rounded;
  
  // Пытаемся адаптировать множитель для укладывания в четырехзначную сетку [0..9999]
  if (tempVal < 1000) {
    while (tempVal < 1000 && scale < 4) {
      tempVal *= 10;
      scale++;
    }
  } else {
    while (tempVal >= 10000 && scale > -4) {
      tempVal /= 10;
      scale--;
    }
  }

  const intVal = Math.round(tempVal);
  const digitsStr = String(intVal).padStart(4, '0').slice(0, 4);
  const digits = Array.from(digitsStr).map(d => {
    const parsed = parseInt(d, 10);
    // Подменяем значение "0" на код 0x0A в соответствии с физическим прибором VT-27
    return parsed === 0 ? 0x0A : parsed;
  });

  return {
    digits,
    scale: scale >= 0 ? scale : 0
  };
}

/**
 * Сборка полной 11-байтовой структуры бинарного кадра для симулятора.
 * Позволяет эмулировать прохождение искаженных пакетов при установке флага forceInvalidCrc.
 */
export function buildPacketFrame(modeCode: number, value: number, forceInvalidCrc: boolean = false): number[] {
  const packet = new Array(11).fill(0);
  packet[0] = 0x10; // Префикс кадра (DF1 Header)
  packet[1] = 0x0A; // Длина оставшейся полезной нагрузки кадра
  packet[2] = 0xFF; // Адрес DST прибора (широковещательный по умолчанию)
  packet[3] = modeCode; // Режим датчика
  packet[4] = 0x00; // Резервный нулевой байт
  
  // Кодируем числовое значение в сетку BCD и экспоненту
  const { digits, scale } = encodeValue(value);
  packet[5] = digits[0];
  packet[6] = digits[1];
  packet[7] = digits[2];
  packet[8] = digits[3];
  packet[9] = scale;
  
  // Вычисляем контрольную CRC (с 1 по 9 индексы включительно)
  let sum = packet.slice(1, 10).reduce((acc, curr) => acc + curr, 0) & 0xFF;
  if (forceInvalidCrc) {
    sum = (sum + 13) & 0xFF; // Специальный вброс ошибки для отладки в консоли
  }
  packet[10] = sum;
  
  return packet;
}

/**
 * Математический генератор физических процессов для имитации показаний виброметра.
 * Моделирует разные виды синусоидального, периодического или шумового сигнала.
 */
export function generateMockValue(config: SimulatorConfig, timeSec: number): number {
  const mode = VT27_MODES[config.modeCode] || VT27_MODES[DEFAULT_MODE];
  
  let baseVal = config.amplitude;
  
  if (config.modeCode === 0x22) {
    // Для оборотов вращения (об/мин) имитируем легкий уход оборотов во времени (wander)
    const wander = Math.sin(timeSec * 0.2) * 200 + Math.cos(timeSec * 0.05) * 50;
    baseVal = config.rpmSpeed + wander;
    if (baseVal < 0) baseVal = 0;
  } else {
    // Для вибрации используем классические волновые законы
    const angle = 2 * Math.PI * config.frequency * timeSec;
    let wave = 0;
    switch (config.signalType) {
      case 'sine':
        wave = Math.sin(angle); // Синусоидальные гармоники
        break;
      case 'triangle':
        wave = Math.abs((angle % (2 * Math.PI)) / Math.PI - 1) * 2 - 1; // Треугольный закон
        break;
      case 'square':
        wave = Math.sin(angle) >= 0 ? 1 : -1; // Прямоугольный меандр
        break;
      case 'noise':
        wave = (Math.random() - 0.5) * 2; // Белый шум
        break;
    }
    // Применяем амплитуду процесса
    baseVal = config.amplitude + wave * (config.amplitude * 0.6);
  }

  // Накладываем случайные высокочастотные помехи (шум датчика)
  const noise = (Math.random() - 0.5) * config.noiseLevel;
  const finalVal = Math.max(0, baseVal + noise);

  // Отрезаем по максимальным границам измерения прибора
  return Math.min(mode.maxVal, Math.max(mode.minVal, finalVal));
}
