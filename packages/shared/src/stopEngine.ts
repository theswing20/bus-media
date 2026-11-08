import { haversineM } from "./geo.js";
import type { GpsFix, Route, Stop, PlayerSettings } from "./types.js";

/**
 * Событие, которое плеер должен озвучить.
 *  - approach: подъезжаем, «Келесі аялдама — X» / «Следующая остановка — X»
 *  - arrive:   на остановке, «Аялдама — X» / «Остановка — X»
 */
export type StopEvent =
  | { type: "approach"; stop: Stop }
  | { type: "arrive"; stop: Stop }
  | { type: "direction"; direction: 0 | 1 };

/**
 * Детерминированная машина состояний. Чистая функция от GPS-фиксов,
 * без таймеров — её легко тестировать на записанных треках.
 *
 * Логика:
 *  1. Направление определяем по порядку пройденных остановок: если две подряд
 *     «посещённые» остановки идут по возрастанию seq в направлении 0 — едем «туда».
 *  2. Следующая ожидаемая остановка — seq+1 от последней посещённой в текущем направлении.
 *     На случай пропуска/сбоя GPS допускаем «перескок» на 2 остановки вперёд.
 *  3. approach — когда дистанция до ожидаемой < approachDistanceM и мы ещё не объявляли её.
 *  4. arrive   — когда внутри radiusM ожидаемой остановки.
 */
export class StopEngine {
  private direction: 0 | 1 | null = null;
  private lastVisited: Stop | null = null;
  private announcedApproach = new Set<string>();
  private announcedArrive = new Set<string>();
  private visitLog: Stop[] = [];

  constructor(private route: Route, private settings: PlayerSettings) {}

  setRoute(route: Route) {
    this.route = route;
    this.reset();
  }

  reset() {
    this.direction = null;
    this.lastVisited = null;
    this.announcedApproach.clear();
    this.announcedArrive.clear();
    this.visitLog = [];
  }

  getDirection() { return this.direction; }
  getLastVisited() { return this.lastVisited; }

  private stopsOf(dir: 0 | 1): Stop[] {
    return this.route.stops.filter((s) => s.direction === dir).sort((a, b) => a.seq - b.seq);
  }

  /** Ближайшая остановка любого направления */
  nearest(fix: GpsFix): { stop: Stop; distM: number } | null {
    let best: { stop: Stop; distM: number } | null = null;
    for (const stop of this.route.stops) {
      const d = haversineM(fix.lat, fix.lng, stop.lat, stop.lng);
      if (!best || d < best.distM) best = { stop, distM: d };
    }
    return best;
  }

  /** Кандидаты «следующей» остановки для текущего направления */
  private expectedNext(): Stop[] {
    if (this.direction === null) return this.route.stops;
    const list = this.stopsOf(this.direction);
    if (!this.lastVisited) return list;
    const idx = list.findIndex((s) => s.id === this.lastVisited!.id);
    const next = list.slice(idx + 1, idx + 3);
    // Конечная: после последней остановки направление меняется
    if (next.length === 0) {
      const other = this.stopsOf(this.direction === 0 ? 1 : 0);
      return other.slice(0, 2);
    }
    return next;
  }

  private inferDirection() {
    const n = this.visitLog.length;
    if (n < 2) return;
    const [a, b] = [this.visitLog[n - 2], this.visitLog[n - 1]];
    if (a.direction === b.direction && b.seq > a.seq) {
      if (this.direction !== a.direction) {
        this.direction = a.direction;
        this.announcedApproach.clear();
      }
    }
  }

  /** Подать очередной GPS-фикс; вернуть события для озвучки (обычно 0–1) */
  update(fix: GpsFix): StopEvent[] {
    const events: StopEvent[] = [];
    const prevDir = this.direction;

    // 1. Проверяем, не оказались ли мы на одной из ожидаемых остановок
    for (const stop of this.expectedNext()) {
      const d = haversineM(fix.lat, fix.lng, stop.lat, stop.lng);
      if (d <= stop.radiusM) {
        if (!this.lastVisited || this.lastVisited.id !== stop.id) {
          this.lastVisited = stop;
          this.visitLog.push(stop);
          if (this.visitLog.length > 20) this.visitLog.shift();
          this.inferDirection();
          if (this.direction !== null && this.direction !== prevDir) {
            events.push({ type: "direction", direction: this.direction });
          }
          if (!this.announcedArrive.has(stop.id)) {
            this.announcedArrive.add(stop.id);
            events.push({ type: "arrive", stop });
          }
        }
        return events;
      }
    }

    // 2. Иначе — проверяем подъезд к ближайшей ожидаемой
    if (this.direction !== null) {
      const next = this.expectedNext()[0];
      if (next) {
        const d = haversineM(fix.lat, fix.lng, next.lat, next.lng);
        if (d <= this.settings.approachDistanceM && !this.announcedApproach.has(next.id)) {
          this.announcedApproach.add(next.id);
          this.announcedArrive.delete(next.id);
          events.push({ type: "approach", stop: next });
        }
      }
    } else {
      // Направление ещё неизвестно (только включились): объявляем «следующую» для ближайшей остановки
      const near = this.nearest(fix);
      if (near && near.distM <= this.settings.approachDistanceM && !this.announcedApproach.has(near.stop.id)) {
        this.announcedApproach.add(near.stop.id);
        events.push({ type: "approach", stop: near.stop });
      }
    }

    // Если отъехали от lastVisited — сбрасываем флаг arrive, чтобы в следующий круг объявить снова
    if (this.lastVisited) {
      const d = haversineM(fix.lat, fix.lng, this.lastVisited.lat, this.lastVisited.lng);
      if (d > this.lastVisited.radiusM * 3) this.announcedArrive.delete(this.lastVisited.id);
    }
    return events;
  }
}
