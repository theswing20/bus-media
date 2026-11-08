-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "nameKk" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stop" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "direction" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "nameKk" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radiusM" INTEGER NOT NULL DEFAULT 60,
    "audioNextKk" TEXT,
    "audioNextRu" TEXT,
    "audioArriveKk" TEXT,
    "audioArriveRu" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "durationSec" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "advertiser" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRoute" (
    "campaignId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,

    CONSTRAINT "CampaignRoute_pkey" PRIMARY KEY ("campaignId","routeId")
);

-- CreateTable
CREATE TABLE "CampaignMedia" (
    "campaignId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CampaignMedia_pkey" PRIMARY KEY ("campaignId","mediaId")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "busNumber" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "routeId" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "manifestVersion" TEXT,
    "appVersion" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Impression" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "completed" BOOLEAN NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "routeId" TEXT,
    "stopId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Impression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Route_number_key" ON "Route"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Stop_routeId_direction_seq_key" ON "Stop"("routeId", "direction", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Device_busNumber_key" ON "Device"("busNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Device_token_key" ON "Device"("token");

-- CreateIndex
CREATE INDEX "Impression_campaignId_startedAt_idx" ON "Impression"("campaignId", "startedAt");

-- CreateIndex
CREATE INDEX "Impression_deviceId_startedAt_idx" ON "Impression"("deviceId", "startedAt");

-- AddForeignKey
ALTER TABLE "Stop" ADD CONSTRAINT "Stop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRoute" ADD CONSTRAINT "CampaignRoute_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRoute" ADD CONSTRAINT "CampaignRoute_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMedia" ADD CONSTRAINT "CampaignMedia_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMedia" ADD CONSTRAINT "CampaignMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Impression" ADD CONSTRAINT "Impression_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Impression" ADD CONSTRAINT "Impression_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Impression" ADD CONSTRAINT "Impression_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
