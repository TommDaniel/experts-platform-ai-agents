import { createReadStream } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import { HTMLWebBaseLoader } from "@langchain/community/document_loaders/web/html";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import ffmpegPath from "ffmpeg-static";
import { DRIZZLE } from "../../db/database.module";
import type { DrizzleDatabase } from "../../db/database.module";
import { sources, type SourceStatus } from "../../db/schema";
import { ensureChunkCollection, sourceIdFilter, weaviateStore } from "./weaviate.util";

const execFile = promisify(execFileCb);

interface SourceRecord {
  id: number;
  userId: number;
  type: "file" | "url";
  name: string;
  reference: string;
  mimeType: string | null;
  filePath: string | null;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async ingestSource(sourceId: number): Promise<void> {
    const source = await this.db.query.sources.findFirst({ where: eq(sources.id, sourceId) });
    if (!source) return;
    try {
      const documents = await this.loadDocuments(source);
      await this.upsertChunks(documents, source);
      await this.db
        .update(sources)
        .set({ status: "ready", error: null, updatedAt: new Date() })
        .where(eq(sources.id, sourceId));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Ingestion failed for source ${sourceId}: ${message}`);
      await this.db
        .update(sources)
        .set({ status: "failed", error: message.slice(0, 500), updatedAt: new Date() })
        .where(eq(sources.id, sourceId));
    }
  }

  async deleteSourceChunks(sourceId: number): Promise<void> {
    try {
      const { client, store } = await weaviateStore();
      try {
        await store.delete({ filter: sourceIdFilter(sourceId) });
      } finally {
        await client.close();
      }
    } catch (err) {
      this.logger.error(`Failed to delete Weaviate chunks for source ${sourceId}`, err);
    }
  }

  private async loadDocuments(source: SourceRecord): Promise<Document[]> {
    if (source.type === "url") {
      const loader = new HTMLWebBaseLoader(source.reference);
      return loader.load();
    }
    if (!source.filePath) return [];
    const mimeType = source.mimeType ?? "";
    if (mimeType === "application/pdf") return new PDFLoader(source.filePath).load();
    if (mimeType.startsWith("image/")) return this.visionDocument(source);
    if (mimeType === "video/mp4") return this.transcribeVideo(source);
    if (mimeType.startsWith("audio/")) return this.transcribeFile(source.filePath, source);
    return new TextLoader(source.filePath).load();
  }

  private openai(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
    return new OpenAI({ apiKey });
  }

  private async visionDocument(source: SourceRecord): Promise<Document[]> {
    const filePath = source.filePath ?? "";
    const data = await readFile(filePath);
    const mimeType = source.mimeType ?? "image/jpeg";
    const response = await this.openai().chat.completions.create({
      model: process.env.VISION_MODEL ?? "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe this image in detail. Include text visible in the image, numbers, and any relevant business information.",
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${data.toString("base64")}` },
            },
          ],
        },
      ],
      max_tokens: 1200,
    });
    const text = response.choices[0]?.message?.content ?? "";
    return [
      new Document({
        pageContent: text || "(image could not be described)",
        metadata: this.metadataFor(source),
      }),
    ];
  }

  private async transcribeVideo(source: SourceRecord): Promise<Document[]> {
    const inputPath = source.filePath ?? "";
    const outputPath = `${inputPath}.audio.mp3`;
    const binary = ffmpegPath ?? "";
    if (!binary) throw new Error("ffmpeg-static binary not found");
    await execFile(binary, [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-q:a",
      "4",
      outputPath,
    ]);
    try {
      return await this.transcribeFile(outputPath, source);
    } finally {
      await rm(outputPath, { force: true });
    }
  }

  private async transcribeFile(path: string, source: SourceRecord): Promise<Document[]> {
    const response = await this.openai().audio.transcriptions.create({
      model: process.env.TRANSCRIPTION_MODEL ?? "gpt-4o-transcribe",
      file: createReadStream(path),
    });
    return [new Document({ pageContent: response.text, metadata: this.metadataFor(source) })];
  }

  private metadataFor(source: SourceRecord): Record<string, unknown> {
    return {
      userId: source.userId,
      sourceId: source.id,
      sourceType: source.type,
      sourceName: source.name,
      sourceReference: source.reference,
    };
  }

  private async upsertChunks(documents: Document[], source: SourceRecord): Promise<void> {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 200 });
    const chunks = await splitter.splitDocuments(
      documents.map(
        (doc) => new Document({ pageContent: doc.pageContent, metadata: this.metadataFor(source) }),
      ),
    );
    if (chunks.length === 0) return;

    await ensureChunkCollection();
    const { client, store } = await weaviateStore();
    try {
      await store.addDocuments(chunks, { ids: chunks.map(() => randomUUID()) });
      this.logger.log(`Indexed ${chunks.length} chunks for source ${source.id}`);
    } finally {
      await client.close();
    }
  }
}

export type { SourceStatus };
export const sourceStatusValues: SourceStatus[] = ["processing", "ready", "failed"];
