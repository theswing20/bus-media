import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { env } from "./env.js";
import { adminAuth } from "./auth.js";
import { routesRoutes } from "./routes/routes.js";
import { mediaRoutes } from "./routes/media.js";
import { campaignRoutes } from "./routes/campaigns.js";
import { deviceRoutes } from "./routes/devices.js";
import { reportRoutes } from "./routes/reports.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

fs.mkdirSync(path.join(env.UPLOAD_DIR, "media"), { recursive: true });
fs.mkdirSync(path.join(env.UPLOAD_DIR, "stops"), { recursive: true });
// Файлы раздаются как есть: плеер качает по URL из манифеста
await app.register(fastifyStatic, { root: path.resolve(env.UPLOAD_DIR), prefix: "/files/" });

app.get("/health", async () => ({ ok: true }));

// Админские API — под токеном
await app.register(async (admin) => {
  admin.addHook("onRequest", adminAuth);
  await admin.register(routesRoutes);
  await admin.register(mediaRoutes);
  await admin.register(campaignRoutes);
  await admin.register(reportRoutes);
}, { prefix: "/api/admin" });

// API бортовых устройств — под токеном устройства
await app.register(deviceRoutes, { prefix: "/api/device" });

app.listen({ port: env.PORT, host: "0.0.0.0" });
