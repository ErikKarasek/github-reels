// Voiceover through ElevenLabs: one request per line, stitched to its neighbours so the
// joins do not pop. Every clip is cached by its text, voice and model, so re-rendering a
// reel spends no credits unless a line changed.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export const DEFAULT_VOICE = "TX3LPaxmHKxFdv7VOQHJ"; // Liam, a pre-made voice the free plan can use
export const DEFAULT_MODEL = "eleven_v4";
/** Silence after each line, seconds. The renderer uses it to time the captions. */
export const GAP = 0.3;

/** A voice id, or the name of a voice on the account (e.g. "George"). */
async function resolveVoice(client, voice) {
  if (!voice) return DEFAULT_VOICE;
  if (/^[A-Za-z0-9]{20}$/.test(voice)) return voice;
  const { voices } = await client.voices.getAll();
  const hit = voices.find((v) => v.name.toLowerCase().startsWith(voice.toLowerCase()));
  if (!hit) {
    const premade = voices.filter((v) => v.category === "premade").map((v) => v.name.split(" ")[0]);
    throw new Error(`No voice called "${voice}". Pre-made ones: ${premade.join(", ")}`);
  }
  return hit.voiceId;
}

const seconds = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());

/**
 * Speak every line into `dir`, return the per-line durations (gap included) and the
 * path of the joined mono WAV.
 */
export async function voiceover(lines, dir, { voice, model = DEFAULT_MODEL, language = "cs" } = {}) {
  const cache = join(dir, "..", ".voice-cache");
  await mkdir(cache, { recursive: true });
  await mkdir(join(dir, "audio"), { recursive: true });

  let client = null;
  let voiceId = voice && /^[A-Za-z0-9]{20}$/.test(voice) ? voice : null;
  const texts = lines.map((l) => l.say ?? l.text);
  const durations = [];
  let spent = 0;

  for (let i = 0; i < texts.length; i++) {
    voiceId ??= await resolveVoice((client ??= new ElevenLabsClient()), voice);
    const key = createHash("sha256").update([voiceId, model, language, texts[i - 1] ?? "", texts[i], texts[i + 1] ?? ""].join("\n")).digest("hex").slice(0, 16);
    const mp3 = join(cache, `${key}.mp3`);
    if (!existsSync(mp3)) {
      client ??= new ElevenLabsClient(); // reads ELEVENLABS_API_KEY
      const audio = await client.textToSpeech.convert(voiceId, {
        text: texts[i],
        modelId: model,
        languageCode: language,
        outputFormat: "mp3_44100_128",
        voiceSettings: { stability: 0.4, similarityBoost: 0.8 },
        previousText: texts.slice(0, i).join(" ").slice(-300) || undefined,
        nextText: texts[i + 1],
      });
      await writeFile(mp3, Buffer.from(await new Response(audio).arrayBuffer()));
      spent += texts[i].length;
    }
    const wav = join(dir, "audio", `${i}.wav`);
    // Trim the silence the model leaves at both ends, then add our own fixed gap.
    const trim = "silenceremove=start_periods=1:start_threshold=-45dB";
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp3, "-af", `${trim},areverse,${trim},areverse,apad=pad_dur=${GAP}`,
      "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", "-map_metadata", "-1", "-fflags", "+bitexact", wav]);
    durations.push(seconds(wav));
  }

  const list = join(dir, "audio", "list.txt");
  await writeFile(list, durations.map((_, i) => `file '${i}.wav'`).join("\n"));
  const joined = join(dir, "voice.wav");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list,
    "-c:a", "pcm_s16le", "-map_metadata", "-1", "-fflags", "+bitexact", joined]);
  return { durations, wav: joined, spent };
}
