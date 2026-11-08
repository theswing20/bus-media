import http from "node:http";
import { EventEmitter } from "node:events";
import { config } from "./config";
import { log } from "./log";

/** Сырое событие от двери: сколько вошло/вышло. */
export interface DoorEvent { door?: number; boarded: number; alighted: number; at: number }

/**
 * Датчики подсчёта пассажиров. Модель железа ещё не выбрана, поэтому источник — адаптер:
 *  - http: датчики (или их контроллер) шлют события на бортовой компьютер по локальной сети:
 *            POST http://<борт>:<PLAYER_PAX_PORT>/count  {"door":1,"in":2,"out":0}
 *          Конкретную модель подключаем тонким переходником к этому формату (или новым режимом здесь же).
 *  - mock: на каждой остановке случайно входят/выходят — для отладки без железа
 *  - off:  датчиков нет, заполненность неизвестна
 *
 * Ведёт текущую заполненность салона и короткую историю событий,
 * чтобы посчитать аудиторию показа задним числом (ролик заканчивается позже, чем начался).
 */
export class PassengerCounter extends EventEmitter {
  private occupancy = 0;
  /** История за 2 часа: заполненность до/после каждого события (с учётом обрезки в 0 и сбросов на конечной). */
  private history: { at: number; boarded: number; before: number; after: number }[] = [];
  private server: http.Server | null = null;

  get enabled() { return config.paxMode !== "off"; }
  getOccupancy(): number | undefined { return this.enabled ? this.occupancy : undefined; }

  start() {
    if (config.paxMode === "http") this.startHttp();
    log.info("passenger counter", config.paxMode);
  }

  /** Принять событие с двери. Заполненность не уходит в минус — датчики ошибаются. */
  ingest(e: Omit<DoorEvent, "at"> & { at?: number }) {
    const boarded = Math.max(0, Math.round(e.boarded || 0));
    const alighted = Math.max(0, Math.round(e.alighted || 0));
    if (!boarded && !alighted) return;
    const ev: DoorEvent = { door: e.door, boarded, alighted, at: e.at ?? Date.now() };
    const before = this.occupancy;
    this.occupancy = Math.max(0, this.occupancy + boarded - alighted);
    this.remember({ at: ev.at, boarded, before, after: this.occupancy });
    this.emit("count", ev, this.occupancy);
  }

  /**
   * На конечной все выходят: сбрасываем накопившуюся ошибку счёта,
   * иначе за смену заполненность «уплывает».
   */
  resetAtTerminal() {
    if (!this.enabled || this.occupancy === 0) return;
    log.info("passengers: reset at terminal, drift", this.occupancy);
    this.remember({ at: Date.now(), boarded: 0, before: this.occupancy, after: 0 });
    this.occupancy = 0;
  }

  private remember(h: { at: number; boarded: number; before: number; after: number }) {
    this.history.push(h);
    const cutoff = Date.now() - 2 * 3600_000;
    while (this.history.length && this.history[0].at < cutoff) this.history.shift();
  }

  /** Сколько людей видели показ: было в салоне на старте + вошло, пока шёл ролик. */
  audienceBetween(startMs: number, endMs: number): number | undefined {
    if (!this.enabled) return undefined;
    // Заполненность на старте = «после» последнего события до старта;
    // если все события позже старта — «до» самого раннего из них; событий нет — текущая.
    let atStart = this.occupancy;
    let lastBefore = -Infinity, firstAfter = Infinity;
    let boardedDuring = 0;
    for (const e of this.history) {
      if (e.at <= startMs && e.at >= lastBefore) { lastBefore = e.at; atStart = e.after; }
      if (e.at > startMs && lastBefore === -Infinity && e.at < firstAfter) { firstAfter = e.at; atStart = e.before; }
      if (e.at > startMs && e.at <= endMs) boardedDuring += e.boarded;
    }
    return atStart + boardedDuring;
  }

  /** mock: вызывается из main на каждом arrive. */
  simulateStop(isTerminal: boolean) {
    if (config.paxMode !== "mock") return;
    const rnd = (n: number) => Math.floor(Math.random() * (n + 1));
    const alighted = isTerminal ? this.occupancy : rnd(Math.ceil(this.occupancy * 0.4));
    const boarded = isTerminal ? 0 : rnd(8);
    // Разносим по двум дверям, как в реальном автобусе
    const b1 = rnd(boarded), a1 = rnd(alighted);
    this.ingest({ door: 1, boarded: b1, alighted: a1 });
    this.ingest({ door: 2, boarded: boarded - b1, alighted: alighted - a1 });
  }

  private startHttp() {
    this.server = http.createServer((req, res) => {
      if (req.method !== "POST" || req.url !== "/count") { res.writeHead(404).end(); return; }
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 10_000) req.destroy(); });
      req.on("end", () => {
        try {
          const m = JSON.parse(body);
          const items = Array.isArray(m) ? m : [m];
          for (const x of items) {
            this.ingest({
              door: x.door != null ? Number(x.door) : undefined,
              boarded: Number(x.in ?? x.boarded ?? 0),
              alighted: Number(x.out ?? x.alighted ?? 0),
              at: x.at ? new Date(x.at).getTime() || undefined : undefined,
            });
          }
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, occupancy: this.occupancy }));
        } catch {
          res.writeHead(400).end();
        }
      });
    });
    this.server.on("error", (e) => log.error("passenger http error", e.message));
    this.server.listen(config.paxPort, config.paxHost, () => log.info(`passenger sensors: POST http://${config.paxHost}:${config.paxPort}/count`));
  }

  stop() { this.server?.close(); }
}
