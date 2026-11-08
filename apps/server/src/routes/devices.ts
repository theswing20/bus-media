import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { deviceAuth } from "../auth.js";
import { buildManifest } from "../services/manifest.js";

/** API бортового компьютера. Всё идемпотентно и терпимо к повторам — связь в автобусе рвётся. */
export async function deviceRoutes(app: FastifyInstance) {
  app.addHook("onRequest", deviceAuth);

  /** Манифест: маршрут + остановки + плейлист + настройки. Плеер сравнивает version и качает только новое. */
  app.get("/manifest", async (req) => buildManifest(req.deviceId!));

  app.post("/heartbeat", async (req) => {
    const b = z.object({
      at: z.string(), lat: z.number().optional(), lng: z.number().optional(), speedKmh: z.number().optional(),
      manifestVersion: z.string().nullable(), appVersion: z.string(), uptimeSec: z.number(), cacheBytes: z.number(),
      occupancy: z.number().int().min(0).optional(),
    }).parse(req.body);
    await db.device.update({
      where: { id: req.deviceId! },
      data: { lastSeenAt: new Date(), lastLat: b.lat, lastLng: b.lng, manifestVersion: b.manifestVersion, appVersion: b.appVersion,
        ...(b.occupancy !== undefined ? { occupancy: b.occupancy, occupancyAt: new Date(b.at) } : {}) },
    });
    return { ok: true, serverTime: new Date().toISOString() };
  });

  /** Пачка показов. Дубли по id молча пропускаются. */
  app.post("/impressions", async (req) => {
    const b = z.object({
      items: z.array(z.object({
        id: z.string(), campaignId: z.string(), mediaId: z.string(),
        startedAt: z.string(), endedAt: z.string(), completed: z.boolean(),
        lat: z.number().optional(), lng: z.number().optional(), routeId: z.string().optional(), stopId: z.string().optional(),
        audience: z.number().int().min(0).optional(),
      })).max(1000),
    }).parse(req.body);

    const res = await db.impression.createMany({
      data: b.items.map((i) => ({ ...i, deviceId: req.deviceId!, startedAt: new Date(i.startedAt), endedAt: new Date(i.endedAt) })),
      skipDuplicates: true,
    });
    return { accepted: b.items.length, inserted: res.count };
  });

  /** Пачка событий датчиков пассажиров. Дубли по id молча пропускаются. */
  app.post("/passengers", async (req) => {
    const b = z.object({
      items: z.array(z.object({
        id: z.string(), at: z.string(), door: z.number().int().optional(),
        boarded: z.number().int().min(0), alighted: z.number().int().min(0), occupancy: z.number().int().min(0),
        routeId: z.string().optional(), stopId: z.string().optional(), direction: z.union([z.literal(0), z.literal(1)]).optional(),
        lat: z.number().optional(), lng: z.number().optional(),
      })).max(1000),
    }).parse(req.body);

    const res = await db.passengerCount.createMany({
      data: b.items.map((i) => ({ ...i, deviceId: req.deviceId!, at: new Date(i.at) })),
      skipDuplicates: true,
    });
    return { accepted: b.items.length, inserted: res.count };
  });
}
