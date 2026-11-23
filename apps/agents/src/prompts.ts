import { getExpert } from "@repo/experts";

export function buildSystemPrompt(expertSlug: string): string {
  const expert = getExpert(expertSlug);
  const persona = expert?.persona ?? getExpert("cto")?.persona ?? "";
  return [
    persona,
    "",
    "Rules:",
    "- Ground your answers in the user's connected documents and URLs whenever relevant. Call the retrieve_context tool to search them.",
    "- Answer in the same language the user writes in.",
    "- Use short paragraphs, bullet lists and markdown for readability.",
    "- If the user asks for an image, call generate_image. If they ask for a video, call generate_video.",
    "- If the context is insufficient, say so honestly and ask a follow-up question.",
  ].join("\n");
}
