import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";

const body = z.object({
  name: z.string().min(1),
  advertiser: z.string().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  active: z.boolean().default(true),
  routeIds: z.array(z.string()).default([]),
  media: z.array(z.object({ mediaId: z.string(), weight: z.number().int().min(1).default(1) })).default([]),
});

const include = { routes: { include: { route: true } }, media: { include: { media: true } } } as const;

export async function campaignRoutes(app: FastifyInstance) {
  app.get("/campaigns", async () => db.campaign.findMany({ orderBy: { createdAt: "desc" }, include }));

  app.post("/campaigns", async (req, reply) => {
    const b = body.parse(req.body);
    const c = await db.campaign.create({
      data: {
        name: b.name, advertiser: b.advertiser, startsAt: b.startsAt, endsAt: b.endsAt, active: b.active,
        routes: { create: b.routeIds.map((routeId) => ({ routeId })) },
        media: { create: b.media },
      },
      include,
    });
    return reply.code(201).send(c);
  });

  app.put("/campaigns/:id", async (req) => {
    const { id } = req.params as { id: string };
    const b = body.parse(req.body);
    return db.$transaction(async (tx) => {
      await tx.campaignRoute.deleteMany({ where: { campaignId: id } });
      await tx.campaignMedia.deleteMany({ where: { campaignId: id } });
      return tx.campaign.update({
        where: { id },
        data: {
          name: b.name, advertiser: b.advertiser, startsAt: b.startsAt, endsAt: b.endsAt, active: b.active,
          routes: { create: b.routeIds.map((routeId) => ({ routeId })) },
          media: { create: b.media },
        },
        include,
      });
    });
  });

  app.delete("/campaigns/:id", async (req) => {
    const { id } = req.params as { id: string };
    await db.campaign.delete({ where: { id } });
    return { ok: true };
  });

  // --- Устройства (управляются из админки) ---
  app.get("/devices", async () => db.device.findMany({ orderBy: { busNumber: "asc" }, include: { route: true } }));

  app.post("/devices", async (req, reply) => {
    const b = z.object({ busNumber: z.string().min(1), routeId: z.string().nullable().optional() }).parse(req.body);
    const { randomBytes } = await import("node:crypto");
    const d = await db.device.create({ data: { busNumber: b.busNumber, routeId: b.routeId ?? null, token: randomBytes(24).toString("hex") } });
    return reply.code(201).send(d); // токен показываем один раз — вбить в конфиг борта
  });

  app.put("/devices/:id", async (req) => {
    const { id } = req.params as { id: string };
    const b = z.object({ busNumber: z.string().optional(), routeId: z.string().nullable().optional(), settings: z.record(z.any()).optional() }).parse(req.body);
    return db.device.update({ where: { id }, data: b });
  });

  app.delete("/devices/:id", async (req) => {
    const { id } = req.params as { id: string };
    await db.device.delete({ where: { id } });
    return { ok: true };
  });
}
