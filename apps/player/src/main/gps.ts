import net from "node:net";
import { EventEmitter } from "node:events";
import { config } from "./config";
import { log } from "./log";
import type { GpsFix } from "@bus/shared";

/**
 * Источник GPS. Три режима:
 *  - gpsd:   подключение к gpsd (рекомендуется на Linux — он сам держит модем/приёмник)
 *  - serial: чтение NMEA с tty напрямую (нужен пакет serialport — см. комментарий)
 *  - mock:   езда по остановкам маршрута для отладки без железа
 */
export class GpsSource extends EventEmitter {
  private sock: net.Socket | null = null;
  private mockTimer: NodeJS.Timeout | null = null;
  private lastFix: GpsFix | null = null;

  getLast() { return this.lastFix; }

  start(mockPath?: { lat: number; lng: number }[]) {
    if (config.gpsMode === "gpsd") this.startGpsd();
    else if (config.gpsMode === "serial") this.startSerial();
    else this.startMock(mockPath ?? []);
  }

  private emitFix(fix: GpsFix) { this.lastFix = fix; this.emit("fix", fix); }

  private startGpsd() {
    const connect = () => {
      this.sock = net.createConnection({ host: config.gpsdHost, port: config.gpsdPort }, () => {
        log.info("gpsd connected");
        this.sock!.write('?WATCH={"enable":true,"json":true};\n');
      });
      let buf = "";
      this.sock.on("data", (d) => {
        buf += d.toString();
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          try {
            const msg = JSON.parse(line);
            if (msg.class === "TPV" && msg.mode >= 2 && typeof msg.lat === "number") {
              this.emitFix({ lat: msg.lat, lng: msg.lon, speedKmh: (msg.speed ?? 0) * 3.6, headingDeg: msg.track, at: Date.now() });
            }
          } catch { /* не JSON — пропускаем */ }
        }
      });
      this.sock.on("error", (e) => log.warn("gpsd error", e.message));
      this.sock.on("close", () => { log.warn("gpsd closed, reconnect in 5s"); setTimeout(connect, 5000); });
    };
    connect();
  }

  private async startSerial() {
    // Чтобы не тянуть нативную зависимость в каждую сборку, serialport подключается динамически:
    //   pnpm --filter @bus/player add serialport @serialport/parser-readline
    try {
      const { SerialPort } = await import("serialport" as string);
      const { ReadlineParser } = await import("@serialport/parser-readline" as string);
      const port = new SerialPort({ path: config.gpsSerial, baudRate: 9600 });
      port.pipe(new ReadlineParser({ delimiter: "\r\n" })).on("data", (line: string) => {
        const fix = parseNmea(line);
        if (fix) this.emitFix(fix);
      });
      port.on("error", (e: Error) => log.warn("serial error", e.message));
    } catch (e) {
      log.error("serialport not installed or port failed; falling back to mock", e);
      this.startMock([]);
    }
  }

  /** Едем по точкам маршрута ~40 км/ч, между остановками — интерполяция. */
  private startMock(path: { lat: number; lng: number }[]) {
    if (path.length < 2) { log.warn("mock gps: no route, standing still"); path = [{ lat: 51.1694, lng: 71.4491 }, { lat: 51.1700, lng: 71.4500 }]; }
    let seg = 0, t = 0;
    this.mockTimer = setInterval(() => {
      const a = path[seg], b = path[(seg + 1) % path.length];
      t += 0.02;
      if (t >= 1) { t = 0; seg = (seg + 1) % path.length; }
      this.emitFix({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, speedKmh: 40, at: Date.now() });
    }, 1000);
  }

  stop() { this.sock?.destroy(); if (this.mockTimer) clearInterval(this.mockTimer); }
}

/** Минимальный парсер $GPRMC / $GNRMC */
export function parseNmea(line: string): GpsFix | null {
  if (!/^\$G[NP]RMC/.test(line)) return null;
  const f = line.split(",");
  if (f[2] !== "A") return null; // нет валидного фикса
  const toDeg = (v: string, hemi: string) => {
    const d = Math.floor(Number(v) / 100), m = Number(v) - d * 100;
    const deg = d + m / 60;
    return hemi === "S" || hemi === "W" ? -deg : deg;
  };
  return { lat: toDeg(f[3], f[4]), lng: toDeg(f[5], f[6]), speedKmh: Number(f[7] || 0) * 1.852, headingDeg: Number(f[8]) || undefined, at: Date.now() };
}
