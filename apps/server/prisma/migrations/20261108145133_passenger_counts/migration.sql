-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "occupancy" INTEGER,
ADD COLUMN     "occupancyAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Impression" ADD COLUMN     "audience" INTEGER;

-- CreateTable
CREATE TABLE "PassengerCount" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "door" INTEGER,
    "boarded" INTEGER NOT NULL,
    "alighted" INTEGER NOT NULL,
    "occupancy" INTEGER NOT NULL,
    "routeId" TEXT,
    "stopId" TEXT,
    "direction" INTEGER,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassengerCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PassengerCount_deviceId_at_idx" ON "PassengerCount"("deviceId", "at");

-- CreateIndex
CREATE INDEX "PassengerCount_routeId_at_idx" ON "PassengerCount"("routeId", "at");

-- CreateIndex
CREATE INDEX "PassengerCount_stopId_at_idx" ON "PassengerCount"("stopId", "at");

-- AddForeignKey
ALTER TABLE "PassengerCount" ADD CONSTRAINT "PassengerCount_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
