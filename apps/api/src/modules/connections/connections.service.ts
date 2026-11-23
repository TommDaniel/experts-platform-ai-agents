import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DRIZZLE } from "../../db/database.module";
import type { DrizzleDatabase } from "../../db/database.module";
import { sources } from "../../db/schema";
import { IngestionService } from "./ingestion.service";
import {
  detectSourceKind,
  extForKind,
  isAllowedUpload,
  normalizeUrlReference,
  sha256,
  userUploadsDir,
  type UploadedFileData,
} from "./uploads.util";

@Injectable()
export class ConnectionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly ingestionService: IngestionService,
  ) {}

  async list(userId: number) {
    return this.db.query.sources.findMany({
      where: eq(sources.userId, userId),
      orderBy: [desc(sources.createdAt)],
    });
  }

  async upload(userId: number, file: UploadedFileData) {
    if (!isAllowedUpload(file.originalname, file.mimetype)) {
      throw new ConflictException(
        "File type not supported. Allowed: PDF, TXT, Markdown, JPG/PNG, MP4, MP3.",
      );
    }
    const reference = sha256(file.buffer);
    const existing = await this.findExisting(userId, "file", reference);
    if (existing) return existing;

    const kind = detectSourceKind(file.originalname, file.mimetype);
    const dir = userUploadsDir(userId);
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${reference}.${extForKind(kind)}`);
    await writeFile(filePath, file.buffer);

    const [row] = await this.db
      .insert(sources)
      .values({
        userId,
        type: "file",
        name: file.originalname,
        reference,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        filePath,
        status: "processing",
      })
      .onConflictDoNothing({ target: [sources.userId, sources.type, sources.reference] })
      .returning();

    if (!row) {
      await rm(filePath, { force: true });
      const duplicate = await this.findExisting(userId, "file", reference);
      if (duplicate) return duplicate;
      throw new ConflictException("Source already connected");
    }

    void this.ingestionService.ingestSource(row.id);
    return row;
  }

  async connectUrl(userId: number, url: string) {
    const reference = normalizeUrlReference(url);
    const existing = await this.findExisting(userId, "url", reference);
    if (existing) return existing;

    const parsed = new URL(url);
    const name = `${parsed.hostname}${parsed.pathname}`;

    const [row] = await this.db
      .insert(sources)
      .values({ userId, type: "url", name, reference, status: "processing" })
      .onConflictDoNothing({ target: [sources.userId, sources.type, sources.reference] })
      .returning();

    if (!row) {
      const duplicate = await this.findExisting(userId, "url", reference);
      if (duplicate) return duplicate;
      throw new ConflictException("Source already connected");
    }

    void this.ingestionService.ingestSource(row.id);
    return row;
  }

  async remove(userId: number, id: number) {
    const source = await this.db.query.sources.findFirst({
      where: and(eq(sources.id, id), eq(sources.userId, userId)),
    });
    if (!source) throw new NotFoundException("Source not found");

    await this.ingestionService.deleteSourceChunks(id);
    if (source.filePath) await rm(source.filePath, { force: true });
    await this.db.delete(sources).where(and(eq(sources.id, id), eq(sources.userId, userId)));
    return { id };
  }

  private findExisting(userId: number, type: "file" | "url", reference: string) {
    return this.db.query.sources.findFirst({
      where: and(
        eq(sources.userId, userId),
        eq(sources.type, type),
        eq(sources.reference, reference),
      ),
    });
  }
}
