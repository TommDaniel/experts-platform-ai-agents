import weaviate, { type WeaviateClient } from "weaviate-client";
import { OpenAIEmbeddings } from "@langchain/openai";
import { WeaviateStore } from "@langchain/weaviate";

export const WEAVIATE_INDEX = "Chunk";
export const CHUNK_METADATA_KEYS = [
  "userId",
  "sourceId",
  "sourceType",
  "sourceName",
  "sourceReference",
] as const;

export function embeddingsModel(): OpenAIEmbeddings {
  return new OpenAIEmbeddings({ model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small" });
}

export async function createWeaviateClient(): Promise<WeaviateClient> {
  const scheme = process.env.WEAVIATE_SCHEME ?? "http";
  const host = process.env.WEAVIATE_HOST ?? "localhost";
  const port = Number(process.env.WEAVIATE_PORT ?? 8080);
  return weaviate.connectToCustom({
    httpHost: host,
    httpPort: port,
    httpSecure: scheme === "https",
  });
}

export async function weaviateStore(): Promise<{ client: WeaviateClient; store: WeaviateStore }> {
  const client = await createWeaviateClient();
  const store = await WeaviateStore.fromExistingIndex(embeddingsModel(), {
    client,
    indexName: WEAVIATE_INDEX,
    metadataKeys: [...CHUNK_METADATA_KEYS],
  });
  return { client, store };
}

export async function ensureChunkCollection(): Promise<void> {
  const client = await createWeaviateClient();
  try {
    if (await client.collections.exists(WEAVIATE_INDEX)) return;
    await client.collections.createFromJson({
      class: WEAVIATE_INDEX,
      vectorizer: "none",
      properties: [
        { name: "userId", dataType: ["int"], indexFilterable: true },
        { name: "sourceId", dataType: ["int"], indexFilterable: true },
        { name: "sourceType", dataType: ["text"] },
        { name: "sourceName", dataType: ["text"] },
        { name: "sourceReference", dataType: ["text"] },
      ],
    });
  } finally {
    await client.close();
  }
}

export function sourceIdFilter(sourceId: number) {
  return weaviate.filter.byProperty("sourceId").equal(sourceId);
}
