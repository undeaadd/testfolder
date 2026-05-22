// Описание структуры дескриптора режима измерения виброметра VT-27
export interface VT27Mode {
  code: number;      // Байт-код режима (например, 0x22, 0x20 и т.д.)
  name: string;      // Понятное человеку наименование физического параметра
  unit: string;      // Единица измерения величины (об/мин, мм, Гц, и т.д.)
  color: string;     // Цветовое представление графика на осциллограмме
  minVal: number;    // Минимальная граница шкалы прибора
  maxVal: number;    // Максимальный предел измеряемой шкалы
}

// Перечисление возможных состояний подключения по веб-последовательному порту (Web Serial)
export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

// Точка данных, сохраняемая в архиве осциллографа и лога
export interface MeasurementPoint {
  timestamp: Date;         // Время фиксации измерения
  value: number;           // Основное физическое значение с виброметра
  modeCode: number;        // Код режима виброметра в момент фиксации
  modeName: string;        // Название физического параметра
  unit: string;            // Единица измерения
  isValid: boolean;        // Статус прохождения проверки CRC прибора
  
  // Сопутствующие технологические параметры с вибродозатора (весов):
  doserPwm?: number;       // ШИМ мощность дозирования фактическая (0 - 1000)
  doserWeight?: number;    // Зарегистрированная масса на весах, грамм
  doserTime?: number;      // Оставшееся время до окончания цикла дозирования, мс
  doserAccel?: number;     // Вычисленное или зарегистрированное физическое ускорение лотка
  feedRate?: number;       // Мгновенный расход материала, г/с
}

// Детализированные метаданные низкоуровневого кадра Modbus RTU/ASCII для визуального декодера
export interface ParsedPacketMeta {
  rawBytes: number[];      // Сырой буфер байт кадра (11 байт)
  length: number;          // Поле объявленной длины полезной нагрузки
  dst: number;             // ID адрес получателя
  modeCode: number;        // Код режима
  digits: number[];        // Прочитанные сырые разряды BCD
  scale: number;           // Степень экспоненты множителя
  crcExpected: number;     // Ожидаемый CRC из 11 байта
  crcCalculated: number;   // Вычисленный CRC по модулю 256
  isValid: boolean;        // Статус целостности данных
  timestamp: Date;         // Время парсинга кадра
}

// Инструментальная статистика измерений датчика в текущей сессии
export interface Stats {
  min: number;             // Минимальное значение сессии
  max: number;             // Максимальное значение сессии
  avg: number;             // Математическое среднее
  count: number;           // Кол-во зарегистрированных точек
}

// Конфигурационный профиль математического эмулятора физического сигнала датчика
export interface SimulatorConfig {
  isActive: boolean;                                           // Флаг активности симулятора
  modeCode: number;                                           // Кодируемый физический параметр
  signalType: 'sine' | 'triangle' | 'square' | 'noise';       // Форма колебаний процесса
  frequency: number;                                          // Частота сигнала, Гц
  amplitude: number;                                          // Базовая амплитуда процесса
  noiseLevel: number;                                         // Коэффициент зашумления датчика
  rpmSpeed: number;                                           // Константные обороты (для режима об/мин)
  packetRateMs: number;                                       // Темп вещания пакетов в порт, мс
  injectErrors: boolean;                                      // Рандомный вброс неверных сумм CRC
}

// Кадр лога консоли последовательного интерфейса
export interface LogMessage {
  id: string;               // Уникальный ID лог-строки
  timestamp: Date;          // Время записи
  direction: 'rx' | 'tx' | 'sys'; // Направление потока (прием/передача/системное сообщение)
  bytes: number[];          // Буфер сырых байт (если передавались)
  message: string;          // Отладочное текстовое описание события
  success: boolean;         // Результат
}
