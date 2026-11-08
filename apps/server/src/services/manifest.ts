import { createHash } from "node:crypto";
import { db } from "../db.js";
import { env } from "../env.js";
import { DEFAULT_SETTINGS, type DeviceManifest, type PlaylistEntry, type Route } from "@bus/shared";

const url = (p: string | null | undefined) => (p ? `${env.PUBLIC_URL}/files/${p}` : undefined);

export async function buildManifest(deviceId: string): Promise<DeviceManifest> {
  const device = await db.device.findUniqueOrThrow({
    where: { id: deviceId },
    include: { route: { include: { stops: { orderBy: [{ direction: "asc" }, { seq: "asc" }] } } } },
  });

  const route: Route | null = device.route
    ? {
        id: device.route.id, number: device.route.number, nameKk: device.route.nameKk, nameRu: device.route.nameRu,
        stops: device.route.stops.map((s) => ({
          id: s.id, routeId: s.routeId, direction: s.direction as 0 | 1, seq: s.seq,
          nameKk: s.nameKk, nameRu: s.nameRu, lat: s.lat, lng: s.lng, radiusM: s.radiusM,
          audio: { next_kk: url(s.audioNextKk), next_ru: url(s.audioNextRu), arrive_kk: url(s.audioArriveKk), arrive_ru: url(s.audioArriveRu) },
        })),
      }
    : null;

  const now = new Date();
  const campaigns = await db.campaign.findMany({
    where: {
      active: true, startsAt: { lte: now }, endsAt: { gte: now },
      OR: [{ routes: { none: {} } }, ...(device.routeId ? [{ routes: { some: { routeId: device.routeId } } }] : [])],
    },
    include: { media: { include: { media: true } } },
  });

  const playlist: PlaylistEntry[] = campaigns.flatMap((c) =>
    c.media.map((cm) => ({
      campaignId: c.id, weight: cm.weight,
      media: { id: cm.media.id, kind: cm.media.kind as "video" | "image" | "audio", url: url(cm.media.path)!, sha256: cm.media.sha256, bytes: cm.media.bytes, durationSec: cm.media.durationSec },
    })),
  );

  const settings = { ...DEFAULT_SETTINGS, ...((device.settings as object) ?? {}) };
  const body = { device: { id: device.id, busNumber: device.busNumber }, route, playlist, settings };
  const version = createHash("sha1").update(JSON.stringify(body)).digest("hex").slice(0, 12);
  return { version, generatedAt: now.toISOString(), ...body };
}
