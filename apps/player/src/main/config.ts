import "dotenv/config";
import path from "node:path";
import os from "node:os";

export const config = {
  serverUrl: process.env.PLAYER_SERVER_URL ?? "http://localhost:4000",
  deviceId: process.env.PLAYER_DEVICE_ID ?? "",
  deviceToken: process.env.PLAYER_DEVICE_TOKEN ?? "",
  gpsMode: (process.env.PLAYER_GPS ?? "mock") as "gpsd" | "serial" | "mock",
  gpsSerial: process.env.PLAYER_GPS_SERIAL ?? "/dev/ttyUSB1",
  gpsdHost: process.env.PLAYER_GPSD_HOST ?? "127.0.0.1",
  gpsdPort: Number(process.env.PLAYER_GPSD_PORT ?? 2947),
  cacheDir: path.resolve(process.env.PLAYER_CACHE_DIR ?? path.join(os.homedir(), ".bus-player")),
  kiosk: process.env.PLAYER_KIOSK !== "0",
  /** Датчики пассажиров: http — принимаем события от датчиков по LAN, mock — имитация, off — нет датчиков */
  paxMode: (process.env.PLAYER_PAX ?? "off") as "http" | "mock" | "off",
  paxHost: process.env.PLAYER_PAX_HOST ?? "0.0.0.0",
  paxPort: Number(process.env.PLAYER_PAX_PORT ?? 8787),
  appVersion: "0.1.0",
};
