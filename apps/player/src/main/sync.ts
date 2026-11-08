import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { config } from "./config";
import { log } from "./log";
import type { DeviceManifest } from "@bus/shared";

/**
 * Синхронизация с сервером. Принцип — офлайн-first:
 *  1. При старте читаем манифест из кэша и сразу играем.
 *  2. Периодически спрашиваем сервер; если version изменился — качаем новые файлы
 *     (по sha256, повторно ничего не тянем), и только когда ВСЁ скачано — переключаем манифест.
 *  3. Если сети нет — молча живём на старом.
 */
export class SyncService extends EventEmitter {
  private manifest: DeviceManifest | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly manifestFile = path.join(config.cacheDir, "manifest.json");
  private readonly filesDir = path.join(config.cacheDir, "files");

  async start() {
    await fsp.mkdir(this.filesDir, { recursive: true });
    try {
      this.manifest = JSON.parse(await fsp.readFile(this.manifestFile, "utf8"));
      log.info("cached manifest", this.manifest?.version);
      this.emit("manifest", this.manifest);
    } catch { log.info("no cached manifest yet"); }
    await this.syncOnce();
    const interval = (this.manifest?.settings.syncIntervalSec ?? 300) * 1000;
    this.timer = setInterval(() => this.syncOnce(), interval);
  }

  getManifest() { return this.manifest; }

  /** URL из манифеста → локальный путь */
  localPath(remoteUrl: string) {
    return path.join(this.filesDir, this.fileNameFor(remoteUrl));
  }
  private fileNameFor(remoteUrl: string) {
    const ext = path.extname(new URL(remoteUrl).pathname);
    return createHash("sha1").update(remoteUrl).digest("hex") + ext;
  }

  private headers() { return { Authorization: `Bearer ${config.deviceToken}` }; }

  async syncOnce() {
    try {
      const res = await fetch(`${config.serverUrl}/api/device/manifest`, { headers: this.headers(), signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`manifest ${res.status}`);
      const fresh: DeviceManifest = await res.json();
      if (fresh.version === this.manifest?.version) return;

      log.info("new manifest", fresh.version, "downloading files…");
      const urls = new Set<string>();
      for (const e of fresh.playlist) urls.add(e.media.url);
      for (const s of fresh.route?.stops ?? []) for (const u of Object.values(s.audio)) if (u) urls.add(u);
      for (const u of urls) await this.download(u);

      await fsp.writeFile(this.manifestFile, JSON.stringify(fresh));
      this.manifest = fresh;
      this.emit("manifest", fresh);
      this.gc(urls).catch(() => {});
      log.info("manifest switched to", fresh.version);
    } catch (e) {
      log.warn("sync failed (offline?)", (e as Error).message);
    }
  }

  private async download(url: string) {
    const dest = this.localPath(url);
    if (fs.existsSync(dest)) return;
    const tmp = dest + ".part";
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok || !res.body) throw new Error(`download ${url} ${res.status}`);
    const ws = fs.createWriteStream(tmp);
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) ws.write(chunk);
    await new Promise<void>((r) => ws.end(r));
    await fsp.rename(tmp, dest);
    log.info("downloaded", path.basename(dest));
  }

  /** Удаляем файлы, которых больше нет в манифесте */
  private async gc(keep: Set<string>) {
    const names = new Set([...keep].map((u) => this.fileNameFor(u)));
    for (const f of await fsp.readdir(this.filesDir)) if (!names.has(f)) await fsp.rm(path.join(this.filesDir, f)).catch(() => {});
  }

  async cacheBytes() {
    let total = 0;
    for (const f of await fsp.readdir(this.filesDir).catch(() => [])) total += (await fsp.stat(path.join(this.filesDir, f))).size;
    return total;
  }

  stop() { if (this.timer) clearInterval(this.timer); }
}
