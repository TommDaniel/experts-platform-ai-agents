import weaviate, { type WeaviateClient } from "weaviate-client";

export const WEAVIATE_INDEX = "Chunk";

export function weaviateConfig(): { scheme: string; host: string; port: number } {
  return {
    scheme: process.env.WEAVIATE_SCHEME ?? "http",
    host: process.env.WEAVIATE_HOST ?? "localhost",
    port: Number(process.env.WEAVIATE_PORT ?? 8080),
  };
}

export async function createWeaviateClient(): Promise<WeaviateClient> {
  const { scheme, host, port } = weaviateConfig();
  return weaviate.connectToCustom({
    httpHost: host,
    httpPort: port,
    httpSecure: scheme === "https",
  });
}

export function userIdFilter(userId: number) {
  return weaviate.filter.byProperty("userId").equal(userId);
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
