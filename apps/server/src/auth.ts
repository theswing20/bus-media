import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "./env.js";
import { db } from "./db.js";

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

/** Простой общий токен для админки. Заменить на пользователей/роли при необходимости. */
export async function adminAuth(req: FastifyRequest, reply: FastifyReply) {
  if (bearer(req) !== env.ADMIN_TOKEN) return reply.code(401).send({ error: "unauthorized" });
}

declare module "fastify" {
  interface FastifyRequest { deviceId?: string }
}

/** Каждое устройство ходит со своим токеном, выданным при регистрации в админке. */
export async function deviceAuth(req: FastifyRequest, reply: FastifyReply) {
  const token = bearer(req);
  if (!token) return reply.code(401).send({ error: "no token" });
  const device = await db.device.findUnique({ where: { token }, select: { id: true } });
  if (!device) return reply.code(401).send({ error: "bad token" });
  req.deviceId = device.id;
}
