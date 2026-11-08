import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";

/**
 * Озвучка остановок через Azure Speech (единственный массовый TTS с нормальным казахским).
 * Возвращает пути файлов относительно UPLOAD_DIR. Если ключ не задан — бросает,
 * вызывающий код оставляет аудио пустым (можно загрузить вручную).
 *
 * Фразы:
 *   kk: «Келесі аялдама — X» / «Аялдама — X»
 *   ru: «Следующая остановка — X» / «Остановка — X»
 */
export async function generateStopAudio(stopId: string, nameKk: string, nameRu: string) {
  if (!env.AZURE_SPEECH_KEY) throw new Error("AZURE_SPEECH_KEY not set");
  const phrases = {
    audioNextKk:   { lang: "kk-KZ", voice: env.TTS_VOICE_KK, text: `Келесі аялдама — ${nameKk}.` },
    audioArriveKk: { lang: "kk-KZ", voice: env.TTS_VOICE_KK, text: `Аялдама — ${nameKk}.` },
    audioNextRu:   { lang: "ru-RU", voice: env.TTS_VOICE_RU, text: `Следующая остановка — ${nameRu}.` },
    audioArriveRu: { lang: "ru-RU", voice: env.TTS_VOICE_RU, text: `Остановка — ${nameRu}.` },
  } as const;

  const out: Record<string, string> = {};
  for (const [field, p] of Object.entries(phrases)) {
    const rel = `stops/${stopId}-${field.replace("audio", "").toLowerCase()}.mp3`;
    const mp3 = await azureTts(p.lang, p.voice, p.text);
    await fs.writeFile(path.join(env.UPLOAD_DIR, rel), mp3);
    out[field] = rel;
  }
  return out as { audioNextKk: string; audioArriveKk: string; audioNextRu: string; audioArriveRu: string };
}

async function azureTts(lang: string, voice: string, text: string): Promise<Buffer> {
  const ssml = `<speak version="1.0" xml:lang="${lang}"><voice name="${voice}"><prosody rate="-5%">${escapeXml(text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "bus-media",
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure TTS ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
