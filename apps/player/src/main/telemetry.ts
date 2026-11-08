import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config";
import { log } from "./log";
import type { Heartbeat, Impression, PassengerCount } from "@bus/shared";

/**
 * Очередь «запиши на диск — отправь пачкой — удали отправленное».
 * Переживает перезапуск плеера и сутки без связи.
 */
class Outbox<T> {
  private pending: T[] = [];
  constructor(private file: string, private endpoint: string, private label: string) {}

  async load() {
    try {
      const lines = (await fsp.readFile(this.file, "utf8")).split("\n").filter(Boolean);
      this.pending = lines.map((l) => JSON.parse(l));
    } catch { /* нет файла */ }
  }

  push(item: T) {
    this.pending.push(item);
    fsp.appendFile(this.file, JSON.stringify(item) + "\n").catch(() => {});
  }

  async flush(headers: Record<string, string>) {
    if (this.pending.length === 0) return;
    const batch = this.pending.slice(0, 500);
    try {
      const res = await fetch(`${config.serverUrl}${this.endpoint}`, { method: "POST", headers, body: JSON.stringify({ items: batch }), signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(String(res.status));
      this.pending = this.pending.slice(batch.length);
      await fsp.writeFile(this.file, this.pending.map((p) => JSON.stringify(p)).join("\n") + (this.pending.length ? "\n" : ""));
      log.info(`${this.label} sent`, batch.length);
    } catch (e) { log.warn(`${this.label} send failed`, (e as Error).message); }
  }
}

type Ctx = {
  getPosition: () => { lat?: number; lng?: number; speedKmh?: number };
  getManifestVersion: () => string | null;
  getRouteId: () => string | undefined;
  getStopId: () => string | undefined;
  getDirection: () => 0 | 1 | undefined;
  getOccupancy: () => number | undefined;
  audienceBetween: (startMs: number, endMs: number) => number | undefined;
  cacheBytes: () => Promise<number>;
};

/**
 * Показы и события датчиков пассажиров копятся в локальных JSONL и уходят пачками;
 * heartbeat — раз в минуту. Любая сетевая ошибка — просто пробуем в следующий раз.
 */
export class Telemetry {
  private impressions = new Outbox<Impression>(path.join(config.cacheDir, "impressions.jsonl"), "/api/device/impressions", "impressions");
  private passengers = new Outbox<PassengerCount>(path.join(config.cacheDir, "passengers.jsonl"), "/api/device/passengers", "passenger counts");
  private timer: NodeJS.Timeout | null = null;
  private started = Date.now();

  constructor(private ctx: Ctx) {}

  async start() {
    await Promise.all([this.impressions.load(), this.passengers.load()]);
    this.timer = setInterval(() => this.flush(), 60_000);
  }

  record(i: { campaignId: string; mediaId: string; startedAt: string; endedAt: string; completed: boolean }) {
    const pos = this.ctx.getPosition();
    const audience = this.ctx.audienceBetween(new Date(i.startedAt).getTime(), new Date(i.endedAt).getTime());
    this.impressions.push({ id: randomUUID(), deviceId: config.deviceId, ...i, lat: pos.lat, lng: pos.lng, routeId: this.ctx.getRouteId(), stopId: this.ctx.getStopId(), audience });
  }

  recordPassengers(e: { door?: number; boarded: number; alighted: number; at: number }, occupancy: number) {
    const pos = this.ctx.getPosition();
    this.passengers.push({
      id: randomUUID(), deviceId: config.deviceId, at: new Date(e.at).toISOString(),
      door: e.door, boarded: e.boarded, alighted: e.alighted, occupancy,
      routeId: this.ctx.getRouteId(), stopId: this.ctx.getStopId(), direction: this.ctx.getDirection(), lat: pos.lat, lng: pos.lng,
    });
  }

  private headers() { return { Authorization: `Bearer ${config.deviceToken}`, "Content-Type": "application/json" }; }

  async flush() {
    const hb: Heartbeat = {
      deviceId: config.deviceId, at: new Date().toISOString(), ...this.ctx.getPosition(),
      manifestVersion: this.ctx.getManifestVersion(), appVersion: config.appVersion,
      uptimeSec: Math.round((Date.now() - this.started) / 1000), cacheBytes: await this.ctx.cacheBytes(),
      occupancy: this.ctx.getOccupancy(),
    };
    try {
      await fetch(`${config.serverUrl}/api/device/heartbeat`, { method: "POST", headers: this.headers(), body: JSON.stringify(hb), signal: AbortSignal.timeout(10000) });
    } catch (e) { log.warn("heartbeat failed", (e as Error).message); }

    await this.impressions.flush(this.headers());
    await this.passengers.flush(this.headers());
  }

  stop() { if (this.timer) clearInterval(this.timer); }
}
