import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

const uploadsDir = process.env.UPLOADS_DIR ?? "./uploads";
const generatedDir = path.join(uploadsDir, "generated");
const publicBaseUrl = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const mediaBaseUrl = `${publicBaseUrl}/api/v1/uploads/generated`;

async function saveGenerated(filename: string, data: Buffer): Promise<string> {
  await mkdir(generatedDir, { recursive: true });
  const filePath = path.join(generatedDir, filename);
  await writeFile(filePath, data);
  return `${mediaBaseUrl}/${filename}`;
}

export async function generateImage(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
  const client = new OpenAI({ apiKey });
  const response = await client.images.generate({
    model: process.env.GPT_IMAGE_MODEL ?? "gpt-image-2",
    prompt,
    n: 1,
    size: "1024x1024",
    response_format: "b64_json",
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generation returned no data");
  return saveGenerated(`image-${Date.now()}.png`, Buffer.from(b64, "base64"));
}

const VIDEO_POLL_INTERVAL_MS = 5000;
const VIDEO_MAX_POLLS = 60;

export async function generateVideo(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_VIDEO_MODEL ?? "gemini-omni-flash";
  const operation = await ai.models.generateVideos({
    model,
    prompt,
    config: { aspectRatio: "16:9", numberOfVideos: 1 },
  });
  let current = operation;
  for (let i = 0; i < VIDEO_MAX_POLLS; i += 1) {
    current = await ai.operations.getVideosOperation({ operation: current });
    if (current.done && current.response) break;
    await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));
  }
  const video = current.response?.generatedVideos?.[0]?.video as
    | { bytesBase64Encoded?: string }
    | undefined;
  const bytes = video?.bytesBase64Encoded;
  if (!bytes) throw new Error("Video generation returned no data");
  return saveGenerated(`video-${Date.now()}.mp4`, Buffer.from(bytes, "base64"));
}
