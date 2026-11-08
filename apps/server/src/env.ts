import "dotenv/config";
export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  ADMIN_TOKEN: process.env.ADMIN_TOKEN ?? "dev-admin",
  PUBLIC_URL: process.env.PUBLIC_URL ?? "http://localhost:4000",
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? "./uploads",
  AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY ?? "",
  AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION ?? "westeurope",
  TTS_VOICE_KK: process.env.TTS_VOICE_KK ?? "kk-KZ-AigulNeural",
  TTS_VOICE_RU: process.env.TTS_VOICE_RU ?? "ru-RU-SvetlanaNeural",
};
