import { SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  Annotation,
  END,
  MemorySaver,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { buildSystemPrompt } from "./prompts.js";
import { allTools } from "./tools.js";

export const StateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  expertSlug: Annotation<string>({ reducer: (_current, next) => next, default: () => "cto" }),
});

export type AgentState = {
  messages: BaseMessage[];
  expertSlug: string;
};

const model = new ChatOpenAI({
  model: process.env.CHAT_MODEL ?? "gpt-4o-mini",
  temperature: 0.4,
}).bindTools(allTools);

const toolNode = new ToolNode(allTools);

async function agentNode(state: AgentState, config: RunnableConfig): Promise<Partial<AgentState>> {
  const system = new SystemMessage(buildSystemPrompt(state.expertSlug));
  const response = await model.invoke([system, ...state.messages], config);
  return { messages: [response] };
}

function toolCallsOf(message: BaseMessage | undefined): unknown[] {
  if (!message) return [];
  const candidate = message as unknown as { tool_calls?: unknown[] };
  return candidate.tool_calls ?? [];
}

function shouldContinue(state: AgentState): string {
  const last = state.messages[state.messages.length - 1];
  return toolCallsOf(last).length > 0 ? "tools" : END;
}

export const graph = new StateGraph(StateAnnotation)
  .addNode("agent", agentNode)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", shouldContinue, { tools: "tools", [END]: END })
  .addEdge("tools", "agent")
  .compile({ checkpointer: new MemorySaver() });
