import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { generateStopAudio } from "../services/tts.js";

const routeBody = z.object({ number: z.string().min(1), nameKk: z.string(), nameRu: z.string() });
const stopBody = z.object({
  direction: z.union([z.literal(0), z.literal(1)]),
  seq: z.number().int().min(0),
  nameKk: z.string().min(1),
  nameRu: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  radiusM: z.number().int().min(20).max(300).default(60),
});

export async function routesRoutes(app: FastifyInstance) {
  app.get("/routes", async () =>
    db.route.findMany({ orderBy: { number: "asc" }, include: { _count: { select: { stops: true, devices: true } } } }));

  app.post("/routes", async (req, reply) => {
    const body = routeBody.parse(req.body);
    return reply.code(201).send(await db.route.create({ data: body }));
  });

  app.get("/routes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const route = await db.route.findUnique({
      where: { id },
      include: { stops: { orderBy: [{ direction: "asc" }, { seq: "asc" }] } },
    });
    return route ?? reply.code(404).send({ error: "not found" });
  });

  app.put("/routes/:id", async (req) => {
    const { id } = req.params as { id: string };
    return db.route.update({ where: { id }, data: routeBody.partial().parse(req.body) });
  });

  app.delete("/routes/:id", async (req) => {
    const { id } = req.params as { id: string };
    await db.route.delete({ where: { id } });
    return { ok: true };
  });

  /** Добавить остановку; озвучка генерируется сразу (если настроен TTS). */
  app.post("/routes/:id/stops", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = stopBody.parse(req.body);
    const stop = await db.stop.create({ data: { ...body, routeId: id } });
    const audio = await generateStopAudio(stop.id, stop.nameKk, stop.nameRu).catch((e) => {
      app.log.warn({ err: e }, "tts failed");
      return null;
    });
    const updated = audio ? await db.stop.update({ where: { id: stop.id }, data: audio }) : stop;
    return reply.code(201).send(updated);
  });

  /** Массовая загрузка остановок направления: заменяет направление целиком. */
  app.put("/routes/:id/stops/bulk", async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ direction: z.union([z.literal(0), z.literal(1)]), stops: z.array(stopBody.omit({ direction: true, seq: true })) }).parse(req.body);
    await db.stop.deleteMany({ where: { routeId: id, direction: body.direction } });
    const created = [];
    for (let seq = 0; seq < body.stops.length; seq++) {
      const s = await db.stop.create({ data: { ...body.stops[seq], seq, direction: body.direction, routeId: id } });
      const audio = await generateStopAudio(s.id, s.nameKk, s.nameRu).catch(() => null);
      created.push(audio ? await db.stop.update({ where: { id: s.id }, data: audio }) : s);
    }
    return created;
  });

  app.put("/stops/:stopId", async (req) => {
    const { stopId } = req.params as { stopId: string };
    const body = stopBody.partial().parse(req.body);
    let stop = await db.stop.update({ where: { id: stopId }, data: body });
    if (body.nameKk !== undefined || body.nameRu !== undefined) {
      const audio = await generateStopAudio(stop.id, stop.nameKk, stop.nameRu).catch(() => null);
      if (audio) stop = await db.stop.update({ where: { id: stop.id }, data: audio });
    }
    return stop;
  });

  app.delete("/stops/:stopId", async (req) => {
    const { stopId } = req.params as { stopId: string };
    await db.stop.delete({ where: { id: stopId } });
    return { ok: true };
  });

  /**
   * Перегенерировать озвучку всех остановок маршрута (после смены голоса/провайдера).
   * Уже озвученные теми же голосом и текстом фразы берутся из кэша — кредиты не тратятся.
   */
  app.post("/routes/:id/regenerate-audio", async (req) => {
    const { id } = req.params as { id: string };
    const stops = await db.stop.findMany({ where: { routeId: id }, orderBy: [{ direction: "asc" }, { seq: "asc" }] });
    const failed: { stop: string; error: string }[] = [];
    let ok = 0;
    for (const s of stops) {
      try {
        const audio = await generateStopAudio(s.id, s.nameKk, s.nameRu);
        await db.stop.update({ where: { id: s.id }, data: audio });
        ok++;
      } catch (e) {
        failed.push({ stop: s.nameRu, error: (e as Error).message });
        if (failed.length === 1 && /not configured|not set|401|403/.test((e as Error).message)) break; // нет смысла долбить дальше
      }
    }
    return { total: stops.length, ok, failed };
  });

  /** Перегенерировать озвучку (например, после смены голоса) */
  app.post("/stops/:stopId/regenerate-audio", async (req) => {
    const { stopId } = req.params as { stopId: string };
    const stop = await db.stop.findUniqueOrThrow({ where: { id: stopId } });
    const audio = await generateStopAudio(stop.id, stop.nameKk, stop.nameRu);
    return db.stop.update({ where: { id: stopId }, data: audio });
  });
}
