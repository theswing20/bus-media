import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { db } from "../db.js";
import { env } from "../env.js";

const kindOf = (mime: string) =>
  mime.startsWith("video/") ? "video" : mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : null;

export async function mediaRoutes(app: FastifyInstance) {
  app.get("/media", async () => db.media.findMany({ orderBy: { createdAt: "desc" } }));

  /** multipart: file + (опц.) durationSec для картинок */
  app.post("/media", async (req, reply) => {
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "file required" });
    const kind = kindOf(part.mimetype);
    if (!kind) return reply.code(400).send({ error: "unsupported type" });

    const ext = path.extname(part.filename) || "";
    const tmpName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const rel = path.join("media", tmpName);
    const abs = path.join(env.UPLOAD_DIR, rel);
    const hash = createHash("sha256");
    let bytes = 0;
    part.file.on("data", (c: Buffer) => { hash.update(c); bytes += c.length; });
    await pipeline(part.file, fs.createWriteStream(abs));

    const fields = part.fields as Record<string, { value?: string } | undefined>;
    const durationSec = Number(fields.durationSec?.value ?? (kind === "image" ? 15 : 0)) || 0;

    const media = await db.media.create({
      data: { kind, filename: part.filename, path: rel.replace(/\\/g, "/"), mime: part.mimetype, sha256: hash.digest("hex"), bytes, durationSec },
    });
    return reply.code(201).send(media);
  });

  app.put("/media/:id", async (req) => {
    const { id } = req.params as { id: string };
    const { durationSec } = req.body as { durationSec?: number };
    return db.media.update({ where: { id }, data: { durationSec } });
  });

  app.delete("/media/:id", async (req) => {
    const { id } = req.params as { id: string };
    const m = await db.media.delete({ where: { id } });
    fs.rm(path.join(env.UPLOAD_DIR, m.path), () => {});
    return { ok: true };
  });
}
