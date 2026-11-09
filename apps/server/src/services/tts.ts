import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { env } from "../env.js";

/**
 * Озвучка остановок. Провайдер — TTS_PROVIDER:
 *  - elevenlabs: модели eleven_v3 / eleven_v4 (казахский есть только в них; multilingual_v2 и flash_v2_5 его не знают)
 *  - azure:      Azure Speech, голоса kk-KZ-AigulNeural / ru-RU-SvetlanaNeural
 * Если провайдер не настроен — бросает, вызывающий код оставляет аудио пустым (можно загрузить вручную).
 *
 * Фразы:
 *   kk: «Келесі аялдама — X» / «Аялдама — X»
 *   ru: «Следующая остановка — X» / «Остановка — X»
 *
 * Имя файла — хэш (провайдер, модель, голос, текст):
 *  - плеер кэширует по URL, поэтому новый голос/текст = новый URL = борта скачают заново;
 *  - та же фраза тем же голосом не генерируется повторно (не тратим кредиты при перегенерации).
 */
type Lang = "kk" | "ru";

export function ttsProvider(): "elevenlabs" | "azure" | null {
  if (env.TTS_PROVIDER === "elevenlabs") return env.ELEVENLABS_API_KEY ? "elevenlabs" : null;
  if (env.TTS_PROVIDER === "azure") return env.AZURE_SPEECH_KEY ? "azure" : null;
  // Не указан явно — берём тот, для которого есть ключ
  return env.ELEVENLABS_API_KEY ? "elevenlabs" : env.AZURE_SPEECH_KEY ? "azure" : null;
}

export async function generateStopAudio(_stopId: string, nameKk: string, nameRu: string) {
  const provider = ttsProvider();
  if (!provider) throw new Error("TTS not configured: set ELEVENLABS_API_KEY or AZURE_SPEECH_KEY");
  const phrases = {
    audioNextKk:   { lang: "kk", text: `Келесі аялдама — ${nameKk}.` },
    audioArriveKk: { lang: "kk", text: `Аялдама — ${nameKk}.` },
    audioNextRu:   { lang: "ru", text: `Следующая остановка — ${nameRu}.` },
    audioArriveRu: { lang: "ru", text: `Остановка — ${nameRu}.` },
  } as const;

  const out: Record<string, string> = {};
  for (const [field, p] of Object.entries(phrases)) out[field] = await synthesizeCached(provider, p.lang, p.text);
  return out as { audioNextKk: string; audioArriveKk: string; audioNextRu: string; audioArriveRu: string };
}

async function synthesizeCached(provider: "elevenlabs" | "azure", lang: Lang, text: string): Promise<string> {
  const voice = provider === "elevenlabs"
    ? `${env.ELEVENLABS_MODEL}/${lang === "kk" ? env.ELEVENLABS_VOICE_KK : env.ELEVENLABS_VOICE_RU}`
    : lang === "kk" ? env.TTS_VOICE_KK : env.TTS_VOICE_RU;
  const hash = createHash("sha256").update(`${provider}\n${voice}\n${lang}\n${text}`).digest("hex").slice(0, 16);
  const rel = `stops/${lang}-${hash}.mp3`;
  const abs = path.join(env.UPLOAD_DIR, rel);
  try { await fs.access(abs); return rel; } catch { /* ещё не генерировали */ }

  const mp3 = provider === "elevenlabs" ? await elevenLabsTts(lang, text) : await azureTts(lang, text);
  await fs.writeFile(abs, mp3);
  return rel;
}

async function elevenLabsTts(lang: Lang, text: string): Promise<Buffer> {
  const voiceId = lang === "kk" ? env.ELEVENLABS_VOICE_KK : env.ELEVENLABS_VOICE_RU;
  if (!voiceId) throw new Error(`ELEVENLABS_VOICE_${lang.toUpperCase()} not set`);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: env.ELEVENLABS_MODEL,
      // Без явного языка короткая фраза с казахским названием может прочитаться «по-русски»
      language_code: lang,
      // Объявления в салоне: ровно и разборчиво, без «актёрской» игры
      voice_settings: { stability: 0.8, similarity_boost: 0.75, style: 0, speed: 0.95 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function azureTts(lang: Lang, text: string): Promise<Buffer> {
  const [locale, voice] = lang === "kk" ? ["kk-KZ", env.TTS_VOICE_KK] : ["ru-RU", env.TTS_VOICE_RU];
  const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${voice}"><prosody rate="-5%">${escapeXml(text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "bus-media",
    },
    body: ssml,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Azure TTS ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
