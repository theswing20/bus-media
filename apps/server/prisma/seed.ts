import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
const db = new PrismaClient();

// Тестовый маршрут: 4 остановки «туда» и 4 «обратно», координаты условные (Астана).
async function main() {
  const route = await db.route.upsert({
    where: { number: "TEST" },
    update: {},
    create: { number: "TEST", nameKk: "Сынақ бағыты", nameRu: "Тестовый маршрут" },
  });
  const stops = [
    ["Бейбітшілік", "Бейбитшилик", 51.1605, 71.4704],
    ["Абай даңғылы", "Проспект Абая", 51.1660, 71.4470],
    ["Сарыарқа", "Сарыарка", 51.1710, 71.4250],
    ["Орталық базар", "Центральный рынок", 51.1770, 71.4060],
  ] as const;
  for (const dir of [0, 1] as const) {
    const ordered = dir === 0 ? [...stops] : [...stops].reverse();
    for (let i = 0; i < ordered.length; i++) {
      const [kk, ru, lat, lng] = ordered[i];
      await db.stop.upsert({
        where: { routeId_direction_seq: { routeId: route.id, direction: dir, seq: i } },
        update: { nameKk: kk, nameRu: ru, lat, lng },
        create: { routeId: route.id, direction: dir, seq: i, nameKk: kk, nameRu: ru, lat, lng },
      });
    }
  }
  const device = await db.device.upsert({
    where: { busNumber: "A700" },
    update: { routeId: route.id },
    create: { busNumber: "A700", token: randomBytes(16).toString("hex"), routeId: route.id },
  });
  console.log("Device A700:", { id: device.id, token: device.token });
}
main().finally(() => db.$disconnect());
