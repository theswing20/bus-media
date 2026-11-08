import { useEffect, useMemo, useRef, useState } from "react";
import type { DeviceManifest, GpsFix, PlaylistEntry, Stop, StopEvent } from "@bus/shared";
import { AudioQueue } from "./audioQueue";

/**
 * Экран плеера. Состояния:
 *  - реклама крутится по плейлисту в бесконечном цикле (взвешенная ротация)
 *  - при событии остановки: реклама приглушается, снизу появляется плашка с названием,
 *    играет kk → ru, после чего громкость возвращается
 */
export function App() {
  const [manifest, setManifest] = useState<DeviceManifest | null>(null);
  const [banner, setBanner] = useState<{ kind: "approach" | "arrive"; stop: Stop } | null>(null);
  const [gps, setGps] = useState<GpsFix | null>(null);
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const queue = useMemo(() => new AudioQueue(), []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [idx, setIdx] = useState(0);
  const startedAt = useRef<string>(new Date().toISOString());

  // --- манифест и локальные пути ---
  useEffect(() => {
    const apply = async (m: DeviceManifest) => {
      const urls = new Set<string>();
      m.playlist.forEach((e) => urls.add(e.media.url));
      m.route?.stops.forEach((s) => Object.values(s.audio).forEach((u) => u && urls.add(u)));
      const map: Record<string, string> = {};
      for (const u of urls) map[u] = await window.player.localUrl(u);
      setLocalUrls(map);
      setManifest(m);
      queue.volume = m.settings.announceVolume;
      window.player.log("info", `manifest ${m.version}: ${m.playlist.length} clips, route ${m.route?.number ?? "—"}`);
    };
    window.player.getManifest().then((m) => m && apply(m));
    return window.player.onManifest(apply);
  }, [queue]);

  useEffect(() => window.player.onGps(setGps), []);

  // --- события остановок ---
  useEffect(() =>
    window.player.onStopEvent((ev: StopEvent) => {
      if (ev.type === "direction") return;
      const key = ev.type === "approach" ? "next" : "arrive";
      setBanner({ kind: ev.type, stop: ev.stop });
      // Сначала казахский, потом русский. При «arrive» прерываем недоигранное «approach».
      queue.enqueue(
        [ev.stop.audio[`${key}_kk`], ev.stop.audio[`${key}_ru`]].map((u) => (u ? localUrls[u] ?? u : undefined)),
        { replace: ev.type === "arrive" },
      );
    }), [localUrls, queue]);

  // --- приглушение рекламы на время объявления ---
  useEffect(() => {
    const ad = () => manifest?.settings.adVolume ?? 0.8;
    queue.onBusy = () => { if (videoRef.current) videoRef.current.volume = manifest?.settings.duckVolume ?? 0.15; };
    queue.onIdle = () => { if (videoRef.current) videoRef.current.volume = ad(); setTimeout(() => setBanner(null), 4000); };
  }, [manifest, queue]);

  // --- плейлист: взвешенная последовательность ---
  const sequence = useMemo<PlaylistEntry[]>(() => {
    if (!manifest) return [];
    const seq: PlaylistEntry[] = [];
    for (const e of manifest.playlist) for (let i = 0; i < Math.max(1, e.weight); i++) seq.push(e);
    // перемешиваем, чтобы один рекламодатель не шёл подряд
    for (let i = seq.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [seq[i], seq[j]] = [seq[j], seq[i]]; }
    return seq;
  }, [manifest]);

  const current = sequence.length ? sequence[idx % sequence.length] : null;

  const finish = (completed: boolean) => {
    if (current) window.player.reportImpression({ campaignId: current.campaignId, mediaId: current.media.id, startedAt: startedAt.current, endedAt: new Date().toISOString(), completed });
    startedAt.current = new Date().toISOString();
    setIdx((i) => i + 1);
  };

  // картинки — по таймеру
  useEffect(() => {
    if (current?.media.kind !== "image") return;
    const t = setTimeout(() => finish(true), (current.media.durationSec || 15) * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, idx]);

  const src = current ? localUrls[current.media.url] : undefined;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
      {current?.media.kind === "video" && src && (
        <video
          key={`${current.media.id}-${idx}`}
          ref={videoRef}
          src={src}
          autoPlay
          playsInline
          onEnded={() => finish(true)}
          onError={(e) => { window.player.log("warn", `video error ${current.media.id}: ${(e.target as HTMLVideoElement).error?.message}`); finish(false); }}
          onLoadedMetadata={(e) => { (e.target as HTMLVideoElement).volume = manifest?.settings.adVolume ?? 0.8; }}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      )}
      {current?.media.kind === "image" && src && (
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      )}
      {!current && (
        <div style={{ color: "#777", display: "grid", placeItems: "center", height: "100%", fontSize: 40 }}>
          {manifest ? "Нет активных роликов" : "Ожидание данных…"}
        </div>
      )}

      {/* Плашка остановки */}
      {banner && (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, padding: "28px 48px",
          background: "linear-gradient(transparent, rgba(0,0,0,.85) 30%)", color: "#fff",
        }}>
          <div style={{ fontSize: 28, opacity: 0.8 }}>{banner.kind === "approach" ? "Келесі аялдама · Следующая остановка" : "Аялдама · Остановка"}</div>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>{banner.stop.nameKk}</div>
          <div style={{ fontSize: 48, opacity: 0.9 }}>{banner.stop.nameRu}</div>
        </div>
      )}

      {/* Служебная строка — только в dev-сборке */}
      {import.meta.env.DEV && (
        <div style={{ position: "absolute", top: 8, left: 8, color: "#0f0", fontSize: 12, fontFamily: "monospace" }}>
          {manifest?.device.busNumber} · {manifest?.route?.number ?? "no route"} · v{manifest?.version} · {gps ? `${gps.lat.toFixed(5)},${gps.lng.toFixed(5)} ${gps.speedKmh.toFixed(0)}km/h` : "no gps"}
        </div>
      )}
    </div>
  );
}
