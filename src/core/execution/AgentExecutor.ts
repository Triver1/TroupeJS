import type { Agent, RespondOptions } from "../agents/Agent.ts";
import type { Message } from "../messages/Message.ts";
import { createMessage } from "../messages/Message.ts";
import { sessionStore } from "./SessionStore.ts";

export interface AgentResponseEnvelope {
  content: string | null;
  message: Message | null;
}

export class AgentExecutor {
  static async respond(
    agent: Agent,
    input: string,
    options: RespondOptions = {},
  ): Promise<AgentResponseEnvelope> {
    const incomingMessage = createMessage({
      role: "user",
      content: input,
      sender: options.sender ?? "user",
      target: options.target ?? agent.name,
      scope: options.scope ?? "directed",
      parentId: options.parentId,
    });

    agent.shortTermMemory.append(incomingMessage);
    sessionStore.append(agent.sessionId, incomingMessage);

    const longTermMemory = await agent.loadLongTermMemory();
    const provider = agent.resolveProvider();
    const response = await provider.generate({
      agentName: agent.name,
      personality: agent.personality,
      systemPrompt: agent.systemPrompt,
      input,
      scope: incomingMessage.scope ?? "directed",
      messages: agent.getChat(),
      tools: agent.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })),
      subagentNames: agent.getSubAgents().map((subagent) => subagent.name),
      longTermMemory,
    });

    for (const toolCall of response.toolCalls ?? []) {
      const tool = agent.tools.find((candidate) => candidate.name === toolCall.toolName);
      if (!tool) {
        continue;
      }

      const output = await tool.execute(toolCall.input);
      const toolMessage = createMessage({
        role: "tool",
        content: JSON.stringify(output),
        sender: tool.name,
        parentId: incomingMessage.id,
        scope: incomingMessage.scope,
      });

      agent.shortTermMemory.append(toolMessage);
      sessionStore.append(agent.sessionId, toolMessage);
    }

    const content = response.content?.trim() || "";
    const shouldReply = response.shouldReply ?? content.length > 0;

    if (!shouldReply || content.length === 0) {
      return { content: null, message: null };
    }

    const outgoingMessage = createMessage({
      role: "agent",
      content,
      sender: agent.name,
      target:
        incomingMessage.scope === "directed" ? incomingMessage.sender : undefined,
      scope: incomingMessage.scope,
      parentId: incomingMessage.id,
      metadata: response.metadata,
    });

    agent.shortTermMemory.append(outgoingMessage);
    sessionStore.append(agent.sessionId, outgoingMessage);
    await agent.notifyUpdate(outgoingMessage);

    return {
      content: outgoingMessage.content,
      message: outgoingMessage,
    };
  }
}
