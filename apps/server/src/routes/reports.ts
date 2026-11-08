import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";

/** Отчёт о показах для рекламодателя (БТ-36): сколько раз, на каких маршрутах, когда. */
export async function reportRoutes(app: FastifyInstance) {
  app.get("/reports/impressions", async (req) => {
    const q = z.object({
      campaignId: z.string().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      groupBy: z.enum(["day", "route", "device", "media"]).default("day"),
    }).parse(req.query);

    const where = {
      ...(q.campaignId ? { campaignId: q.campaignId } : {}),
      startedAt: { gte: q.from ?? new Date(0), lte: q.to ?? new Date() },
    };

    const rows = await db.impression.findMany({ where, select: { startedAt: true, routeId: true, deviceId: true, mediaId: true, completed: true, audience: true } });
    const keyOf = (r: typeof rows[number]) =>
      q.groupBy === "day" ? r.startedAt.toISOString().slice(0, 10)
      : q.groupBy === "route" ? (r.routeId ?? "—")
      : q.groupBy === "device" ? r.deviceId
      : r.mediaId;

    // audience — «контакты»: сумма людей в салоне по всем показам. Показы без датчиков в неё не входят,
    // поэтому рядом отдаём, по скольким показам она посчитана.
    type G = { key: string; total: number; completed: number; audience: number; withAudience: number };
    const agg = new Map<string, G>();
    for (const r of rows) {
      const k = keyOf(r);
      const a = agg.get(k) ?? { key: k, total: 0, completed: 0, audience: 0, withAudience: 0 };
      a.total++; if (r.completed) a.completed++;
      if (r.audience != null) { a.audience += r.audience; a.withAudience++; }
      agg.set(k, a);
    }
    const groups = [...agg.values()].sort((a, b) => a.key.localeCompare(b.key));
    return {
      total: rows.length,
      audience: groups.reduce((s, g) => s + g.audience, 0),
      withAudience: groups.reduce((s, g) => s + g.withAudience, 0),
      groups,
    };
  });

  /**
   * Пассажиропоток с датчиков дверей: вошло / вышло / пиковая заполненность.
   * groupBy=stop — по остановкам (в порядке маршрута), day/hour — по времени, device/route — по бортам/маршрутам.
   */
  app.get("/reports/passengers", async (req) => {
    const q = z.object({
      routeId: z.string().optional(),
      deviceId: z.string().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      groupBy: z.enum(["stop", "day", "hour", "device", "route"]).default("stop"),
    }).parse(req.query);

    const rows = await db.passengerCount.findMany({
      where: {
        ...(q.routeId ? { routeId: q.routeId } : {}),
        ...(q.deviceId ? { deviceId: q.deviceId } : {}),
        at: { gte: q.from ?? new Date(0), lte: q.to ?? new Date() },
      },
      select: { at: true, boarded: true, alighted: true, occupancy: true, routeId: true, stopId: true, deviceId: true },
    });

    const [stops, devices, routes] = await Promise.all([
      q.groupBy === "stop" ? db.stop.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.stopId).filter((x): x is string => !!x))] } } }) : [],
      q.groupBy === "device" ? db.device.findMany({ select: { id: true, busNumber: true } }) : [],
      q.groupBy === "route" ? db.route.findMany({ select: { id: true, number: true } }) : [],
    ]);
    const stopById = new Map(stops.map((s) => [s.id, s]));
    const pad = (n: number) => String(n).padStart(2, "0");

    type G = { key: string; label: string; order: string; boarded: number; alighted: number; maxOccupancy: number };
    const agg = new Map<string, G>();
    for (const r of rows) {
      let key: string, label: string, order: string;
      if (q.groupBy === "stop") {
        const st = r.stopId ? stopById.get(r.stopId) : undefined;
        key = r.stopId ?? "—";
        label = st ? `${st.nameRu} (${st.direction === 0 ? "туда" : "обратно"})` : "между остановками";
        order = st ? `${st.routeId}-${st.direction}-${pad(st.seq)}` : "~";
      } else if (q.groupBy === "day") {
        key = label = order = r.at.toISOString().slice(0, 10);
      } else if (q.groupBy === "hour") {
        // Час по Астане (UTC+5) — так читают отчёты в парке
        const h = (r.at.getUTCHours() + 5) % 24;
        key = order = pad(h); label = `${pad(h)}:00–${pad(h)}:59`;
      } else if (q.groupBy === "device") {
        key = r.deviceId; label = devices.find((d) => d.id === r.deviceId)?.busNumber ?? r.deviceId; order = label;
      } else {
        key = r.routeId ?? "—"; label = routes.find((x) => x.id === r.routeId)?.number ?? "—"; order = label;
      }
      const g = agg.get(key) ?? { key, label, order, boarded: 0, alighted: 0, maxOccupancy: 0 };
      g.boarded += r.boarded; g.alighted += r.alighted; g.maxOccupancy = Math.max(g.maxOccupancy, r.occupancy);
      agg.set(key, g);
    }

    return {
      boarded: rows.reduce((s, r) => s + r.boarded, 0),
      alighted: rows.reduce((s, r) => s + r.alighted, 0),
      maxOccupancy: rows.reduce((m, r) => Math.max(m, r.occupancy), 0),
      groups: [...agg.values()].sort((a, b) => a.order.localeCompare(b.order)).map(({ order: _o, ...g }) => g),
    };
  });

  app.get("/reports/devices", async () => {
    const devices = await db.device.findMany({ include: { route: true }, orderBy: { busNumber: "asc" } });
    const now = Date.now();
    return devices.map((d) => ({
      ...d, token: undefined,
      online: d.lastSeenAt ? now - d.lastSeenAt.getTime() < 10 * 60 * 1000 : false,
    }));
  });
}
