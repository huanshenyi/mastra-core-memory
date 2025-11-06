import { mastra } from '@/src/mastra';
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { toAISdkFormat } from "@mastra/ai-sdk";
import { RuntimeContext } from "@mastra/core/runtime-context";

export async function POST(req: Request) {
  const { messages, data } = await req.json();
  const myAgent = mastra.getAgent("conversationAgent");

  // Create RuntimeContext and populate it with data from the client
  const runtimeContext = new RuntimeContext();

  if (data) {
    for (const [key, value] of Object.entries(data)) {
      runtimeContext.set(key, value);
    }
  }

  // Extract sessionId from data for threadId
  // const sessionId = data?.sessionId;

  // Stream with threadId (sessionId) and runtimeContext
  const stream = await myAgent.stream(messages, {
    // threadId: sessionId,
    runtimeContext,
    // Note: userId and other data are now accessible via runtimeContext
    // Tools can access them with runtimeContext.get('userId'), etc.
  });

  // Transform stream into AI SDK format and create UI messages stream
  const uiMessageStream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.merge(toAISdkFormat(stream, { from: 'agent' })!);
    },
  });

  return createUIMessageStreamResponse({
    stream: uiMessageStream,
  });
}
