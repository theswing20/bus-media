import { app, BrowserWindow, ipcMain, protocol, net as enet, screen } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "./config";
import { log } from "./log";
import { GpsSource } from "./gps";
import { SyncService } from "./sync";
import { Telemetry } from "./telemetry";
import { PassengerCounter } from "./passengers";
import { StopEngine, DEFAULT_SETTINGS, type DeviceManifest, type GpsFix } from "@bus/shared";

/**
 * Main-процесс бортового плеера.
 *  - одно окно на весь экран в киоске (на Linux мониторы клонируются средствами xrandr — см. deploy/)
 *  - GPS → StopEngine → события «approach/arrive» → окно озвучивает
 *  - SyncService держит кэш, Telemetry шлёт показы и heartbeat
 */
const sync = new SyncService();
const gps = new GpsSource();
const pax = new PassengerCounter();
let engine: StopEngine | null = null;
let win: BrowserWindow | null = null;
let currentStopId: string | undefined;

const telemetry = new Telemetry({
  getPosition: () => { const f = gps.getLast(); return f ? { lat: f.lat, lng: f.lng, speedKmh: f.speedKmh } : {}; },
  getManifestVersion: () => sync.getManifest()?.version ?? null,
  getRouteId: () => sync.getManifest()?.route?.id,
  getStopId: () => currentStopId,
  getDirection: () => engine?.getDirection() ?? undefined,
  getOccupancy: () => pax.getOccupancy(),
  audienceBetween: (a, b) => pax.audienceBetween(a, b),
  cacheBytes: () => sync.cacheBytes(),
});

// Локальные файлы отдаём через свою схему, чтобы не ослаблять webSecurity
protocol.registerSchemesAsPrivileged([{ scheme: "cache", privileges: { secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }]);

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().size;
  win = new BrowserWindow({
    width, height, kiosk: config.kiosk, fullscreen: config.kiosk, frame: !config.kiosk, autoHideMenuBar: true, backgroundColor: "#000",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false, backgroundThrottling: false },
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, "../renderer/index.html"));
  win.on("closed", () => { win = null; });
}

function applyManifest(m: DeviceManifest) {
  const settings = { ...DEFAULT_SETTINGS, ...m.settings };
  if (m.route) {
    if (!engine) engine = new StopEngine(m.route, settings);
    else engine.setRoute(m.route);
  } else engine = null;
  win?.webContents.send("manifest", m);
}

function onFix(fix: GpsFix) {
  win?.webContents.send("gps", fix);
  if (!engine) return;
  for (const ev of engine.update(fix)) {
    if (ev.type === "arrive") {
      currentStopId = ev.stop.id;
      const maxSeq = Math.max(...(sync.getManifest()?.route?.stops ?? []).filter((s) => s.direction === ev.stop.direction).map((s) => s.seq));
      const isTerminal = ev.stop.seq === maxSeq;
      pax.simulateStop(isTerminal);
      if (isTerminal) pax.resetAtTerminal();
    }
    log.info("stop event", ev.type, "stop" in ev ? ev.stop.nameRu : ev.direction);
    win?.webContents.send("stop-event", ev);
  }
}

app.whenReady().then(async () => {
  protocol.handle("cache", (req) => enet.fetch(pathToFileURL(sync.localPath(decodeURIComponent(req.url.slice("cache://".length)))).toString()));

  ipcMain.handle("getManifest", () => sync.getManifest());
  ipcMain.handle("localUrl", (_e, remoteUrl: string) => `cache://${encodeURIComponent(remoteUrl)}`);
  ipcMain.on("impression", (_e, i) => telemetry.record(i));
  ipcMain.on("log", (_e, level: "info" | "warn" | "error", msg: string) => log[level]("[renderer]", msg));

  createWindow();
  sync.on("manifest", applyManifest);
  await sync.start();
  await telemetry.start();

  pax.on("count", (e, occupancy: number) => {
    telemetry.recordPassengers(e, occupancy);
    log.info("passengers", `door ${e.door ?? "?"} +${e.boarded} -${e.alighted} → ${occupancy}`);
  });
  pax.start();

  const route = sync.getManifest()?.route;
  gps.on("fix", onFix);
  gps.start(route?.stops.filter((s) => s.direction === 0).map((s) => ({ lat: s.lat, lng: s.lng })));

  log.info("player started", { device: config.deviceId, gps: config.gpsMode, pax: config.paxMode, cache: config.cacheDir });
});

app.on("window-all-closed", () => { gps.stop(); pax.stop(); sync.stop(); telemetry.stop(); app.quit(); });
// На борту не должно быть диалогов: любое необработанное исключение — в лог, продолжаем жить
process.on("uncaughtException", (e) => log.error("uncaught", e));
process.on("unhandledRejection", (e) => log.error("unhandled", e));
