import { createHash } from "node:crypto";
import path from "node:path";

export type SourceKind = "pdf" | "text" | "markdown" | "image" | "video" | "audio";

export interface UploadedFileData {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export const ALLOWED_UPLOAD_MIME_TYPES: Record<string, SourceKind> = {
  "application/pdf": "pdf",
  "text/plain": "text",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "image/jpeg": "image",
  "image/png": "image",
  "video/mp4": "video",
  "audio/mpeg": "audio",
  "audio/mp3": "audio",
};

const EXTENSION_KINDS: Record<string, SourceKind> = {
  pdf: "pdf",
  txt: "text",
  md: "markdown",
  jpg: "image",
  jpeg: "image",
  png: "image",
  mp4: "video",
  mp3: "audio",
};

export function uploadsRootDir(): string {
  return process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(process.cwd(), "uploads");
}

export function userUploadsDir(userId: number): string {
  return path.join(uploadsRootDir(), String(userId));
}

export function detectSourceKind(filename: string, mimeType: string): SourceKind {
  const fromMime = ALLOWED_UPLOAD_MIME_TYPES[mimeType];
  if (fromMime) return fromMime;
  const ext = path.extname(filename).slice(1).toLowerCase();
  return EXTENSION_KINDS[ext] ?? "text";
}

export function isAllowedUpload(filename: string, mimeType: string): boolean {
  if (ALLOWED_UPLOAD_MIME_TYPES[mimeType]) return true;
  const ext = path.extname(filename).slice(1).toLowerCase();
  return EXTENSION_KINDS[ext] !== undefined;
}

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function normalizeUrlReference(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/+$/, "");
}

export function extForKind(kind: SourceKind): string {
  switch (kind) {
    case "pdf":
      return "pdf";
    case "text":
      return "txt";
    case "markdown":
      return "md";
    case "image":
      return "jpg";
    case "video":
      return "mp4";
    case "audio":
      return "mp3";
  }
}
