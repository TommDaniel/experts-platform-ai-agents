import { tool } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import { OpenAIEmbeddings } from "@langchain/openai";
import { WeaviateStore } from "@langchain/weaviate";
import { z } from "zod";
import { createWeaviateClient, userIdFilter, WEAVIATE_INDEX } from "./weaviate.js";
import { generateImage, generateVideo } from "./media.js";

const TOP_K = Number(process.env.RETRIEVAL_TOP_K ?? 6);

export const retrieveTool = tool(
  async (input: { query: string; k?: number }, config: RunnableConfig) => {
    const userId = config.configurable?.userId as number | undefined;
    if (userId == null) return "No user context is available for this request.";

    const client = await createWeaviateClient();
    try {
      const store = await WeaviateStore.fromExistingIndex(
        new OpenAIEmbeddings({ model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small" }),
        {
          client,
          indexName: WEAVIATE_INDEX,
          metadataKeys: ["userId", "sourceId", "sourceType", "sourceName", "sourceReference"],
        },
      );
      const k = Math.min(input.k ?? TOP_K, 20);
      const results = await store.similaritySearchWithScore(input.query, k, userIdFilter(userId));
      if (results.length === 0) return "No matching content was found in the user's documents.";
      return results
        .map(
          ([doc, score]) =>
            `[score=${score.toFixed(3)} source=${String(doc.metadata.sourceName ?? "unknown")}]\n${doc.pageContent}`,
        )
        .join("\n\n");
    } finally {
      await client.close();
    }
  },
  {
    name: "retrieve_context",
    description:
      "Search the user's connected documents and URLs for context relevant to the question.",
    schema: z.object({
      query: z.string().describe("The search query"),
      k: z.number().int().min(1).max(20).optional().describe("Number of chunks to return"),
    }),
  },
);

export const generateImageTool = tool(
  async (input: { prompt: string }): Promise<string> => {
    const url = await generateImage(input.prompt);
    return `Image generated successfully. URL: ${url}`;
  },
  {
    name: "generate_image",
    description:
      "Generate an image from a text prompt using the gpt-image-2 model. Returns a public URL to the generated image.",
    schema: z.object({
      prompt: z.string().describe("Detailed description of the image to generate"),
    }),
  },
);

export const generateVideoTool = tool(
  async (input: { prompt: string }): Promise<string> => {
    const url = await generateVideo(input.prompt);
    return `Video generated successfully. URL: ${url}`;
  },
  {
    name: "generate_video",
    description:
      "Generate a short video from a text prompt using a Gemini video model. Returns a public URL to the generated video.",
    schema: z.object({
      prompt: z.string().describe("Detailed description of the video to generate"),
    }),
  },
);

export const allTools = [retrieveTool, generateImageTool, generateVideoTool];
