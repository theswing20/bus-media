/** Типы, общие для сервера, админки и бортового плеера. */

export type Lang = "kk" | "ru";

export interface Stop {
  id: string;
  routeId: string;
  /** Направление: 0 — туда (A→B), 1 — обратно (B→A) */
  direction: 0 | 1;
  /** Порядковый номер остановки в направлении, с 0 */
  seq: number;
  nameKk: string;
  nameRu: string;
  lat: number;
  lng: number;
  /** Радиус геозоны «на остановке», м */
  radiusM: number;
  /** Относительные URL аудио: /media/stops/<id>-kk.mp3 и т. д. */
  audio: Partial<Record<`${"next" | "arrive"}_${Lang}`, string>>;
}

export interface Route {
  id: string;
  number: string;        // «44», «60А»
  nameKk: string;
  nameRu: string;
  stops: Stop[];
}

export interface MediaItem {
  id: string;
  kind: "video" | "image" | "audio";
  url: string;           // относительный URL на сервере
  sha256: string;
  bytes: number;
  durationSec: number;   // для image — сколько показывать
}

export interface PlaylistEntry {
  campaignId: string;
  media: MediaItem;
  /** Вес при ротации (1 = обычный ролик) */
  weight: number;
}

/** Всё, что нужно плееру для автономной работы. Скачивается целиком при синке. */
export interface DeviceManifest {
  version: string;       // хэш содержимого — если не поменялся, ничего не качаем
  generatedAt: string;
  device: { id: string; busNumber: string };
  route: Route | null;
  playlist: PlaylistEntry[];
  settings: PlayerSettings;
}

export interface PlayerSettings {
  /** За сколько метров до остановки объявлять «следующая» */
  approachDistanceM: number;
  /** Громкость рекламы 0..1 и объявлений 0..1 */
  adVolume: number;
  announceVolume: number;
  /** Приглушать рекламу на время объявления до этого уровня */
  duckVolume: number;
  /** Интервал синка с сервером, сек */
  syncIntervalSec: number;
  /** Минимальная скорость (км/ч) для определения движения */
  movingSpeedKmh: number;
}

export const DEFAULT_SETTINGS: PlayerSettings = {
  approachDistanceM: 250,
  adVolume: 0.8,
  announceVolume: 1,
  duckVolume: 0.15,
  syncIntervalSec: 300,
  movingSpeedKmh: 5,
};

/** Один показ ролика — лог отправляется на сервер пачками. */
export interface Impression {
  id: string;            // uuid, для идемпотентности
  deviceId: string;
  campaignId: string;
  mediaId: string;
  startedAt: string;
  endedAt: string;
  completed: boolean;
  lat?: number;
  lng?: number;
  routeId?: string;
  stopId?: string;       // ближайшая остановка в момент показа
  /** Аудитория показа: было в салоне на старте + вошло за время ролика. Нет датчиков — undefined. */
  audience?: number;
}

/**
 * Событие датчика подсчёта пассажиров (одна дверь, один момент).
 * Реальный датчик может слать по человеку за событие, mock — суммой за остановку.
 */
export interface PassengerCount {
  id: string;            // uuid, для идемпотентности
  deviceId: string;
  at: string;
  door?: number;         // номер двери, с 1
  boarded: number;       // вошло
  alighted: number;      // вышло
  /** Заполненность салона после события */
  occupancy: number;
  routeId?: string;
  stopId?: string;       // остановка, на которой стоим (последний arrive)
  direction?: 0 | 1;
  lat?: number;
  lng?: number;
}

export interface Heartbeat {
  deviceId: string;
  at: string;
  lat?: number;
  lng?: number;
  speedKmh?: number;
  manifestVersion: string | null;
  appVersion: string;
  uptimeSec: number;
  cacheBytes: number;
  /** Сколько людей в салоне сейчас (если есть датчики) */
  occupancy?: number;
}

export interface GpsFix {
  lat: number;
  lng: number;
  speedKmh: number;
  headingDeg?: number;
  at: number;            // epoch ms
}
