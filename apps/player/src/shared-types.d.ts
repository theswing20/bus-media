import type { DeviceManifest, GpsFix } from "@bus/shared";
import type { StopEvent } from "@bus/shared";

/** API, которое main-процесс отдаёт в окно через preload. */
export interface PlayerBridge {
  getManifest(): Promise<DeviceManifest | null>;
  /** Локальный URL к закэшированному файлу по его URL из манифеста */
  localUrl(remoteUrl: string): Promise<string>;
  onManifest(cb: (m: DeviceManifest) => void): () => void;
  onGps(cb: (fix: GpsFix) => void): () => void;
  onStopEvent(cb: (e: StopEvent) => void): () => void;
  reportImpression(i: { campaignId: string; mediaId: string; startedAt: string; endedAt: string; completed: boolean }): void;
  log(level: "info" | "warn" | "error", msg: string): void;
}
declare global { interface Window { player: PlayerBridge } }
