import type { Agent, RespondOptions } from "../agents/Agent.ts";
import type { Message } from "../messages/Message.ts";
import { createMessage } from "../messages/Message.ts";
import { sessionStore } from "./SessionStore.ts";

export interface AgentResponseEnvelope {
  content: string | null;
  message: Message | null;
  parsed?: unknown;
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
    const allowToolCalls = options.allowToolCalls ?? true;
    const maxToolRounds = options.maxToolRounds ?? 3;
    let currentInput = input;
    const systemPrompt = options.promptPrefix
      ? `${options.promptPrefix}\n\n${agent.systemPrompt ?? ""}`
      : agent.systemPrompt;

    let response = await provider.generate({
      agentName: agent.name,
      personality: agent.personality,
      systemPrompt,
      input: currentInput,
      scope: incomingMessage.scope ?? "directed",
      messages: agent.getChat(),
      tools: allowToolCalls
        ? agent.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema
            ? {
              type: "object",
              additionalProperties: true,
            }
            : {
              type: "object",
              additionalProperties: true,
            },
        }))
        : [],
      subagentNames: agent.getSubAgents().map((subagent) => subagent.name),
      longTermMemory,
      responseSchema: options.responseSchema,
    });
    let toolRounds = 0;

    const supportsToolResponses = provider.supportsToolResponses();

    while (allowToolCalls && response.toolCalls?.length && toolRounds < maxToolRounds) {
      const rawHistoryToolCalls = (response.toolCalls ?? []).filter((toolCall) => {
        const tool = agent.tools.find((candidate) => candidate.name === toolCall.toolName);
        return tool?.historyMode === "raw";
      });

      if (supportsToolResponses && rawHistoryToolCalls.length > 0) {
        const toolCallMessage = createMessage({
          role: "agent",
          content: response.content ?? "",
          sender: agent.name,
          parentId: incomingMessage.id,
          scope: incomingMessage.scope,
          toolCalls: rawHistoryToolCalls,
        });

        agent.shortTermMemory.append(toolCallMessage);
        sessionStore.append(agent.sessionId, toolCallMessage);
      }

      for (const toolCall of response.toolCalls ?? []) {
        const tool = agent.tools.find((candidate) => candidate.name === toolCall.toolName);
        if (!tool) {
          continue;
        }

        const output = await tool.execute(toolCall.input);
        if (tool.historyMode === "raw") {
          const toolMessage = createMessage({
            role: supportsToolResponses ? "tool" : "user",
            content: supportsToolResponses
              ? JSON.stringify(output)
              : `Tool response from ${tool.name}: ${JSON.stringify(output)}`,
            sender: tool.name,
            parentId: incomingMessage.id,
            scope: incomingMessage.scope,
            toolCallId: supportsToolResponses ? toolCall.id : undefined,
          });

          agent.shortTermMemory.append(toolMessage);
          sessionStore.append(agent.sessionId, toolMessage);
          continue;
        }

        if (tool.historyMode === "hidden") {
          const hiddenToolMessage = createMessage({
            role: "tool",
            content: JSON.stringify(output),
            sender: tool.name,
            parentId: incomingMessage.id,
            scope: incomingMessage.scope,
            toolCallId: supportsToolResponses ? toolCall.id : undefined,
            metadata: {
              visibility: "hidden",
            },
          });

          sessionStore.append(agent.sessionId, hiddenToolMessage);
          continue;
        }

        const steeringContent = tool.historyFormatter
          ? tool.historyFormatter(output)
          : `Conversation update from ${tool.name}.`;

        if (!steeringContent) {
          continue;
        }

        const steeringMessage = createMessage({
          role: "user",
          content: steeringContent,
          sender: tool.name,
          parentId: incomingMessage.id,
          scope: incomingMessage.scope,
          metadata: {
            visibility: "steering",
          },
        });

        agent.shortTermMemory.append(steeringMessage);
        sessionStore.append(agent.sessionId, steeringMessage);
      }

      toolRounds += 1;
      currentInput = "";
      response = await provider.generate({
        agentName: agent.name,
        personality: agent.personality,
        systemPrompt,
        input: currentInput,
        scope: incomingMessage.scope ?? "directed",
        messages: agent.getChat(),
        tools: allowToolCalls
          ? agent.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
              ? {
                type: "object",
                additionalProperties: true,
              }
              : {
                type: "object",
                additionalProperties: true,
              },
          }))
          : [],
        subagentNames: agent.getSubAgents().map((subagent) => subagent.name),
        longTermMemory,
      });
    }

    let content = response.content?.trim() || "";
    let shouldReply = response.shouldReply ?? content.length > 0;
    let metadata = response.metadata;

    if (response.parsed !== undefined && options.structuredResponseHandler) {
      const handled = await options.structuredResponseHandler(response.parsed, content);
      content = handled.content ?? "";
      shouldReply = handled.shouldReply;
      metadata = handled.metadata ?? metadata;
    }

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
      metadata,
    });

    agent.shortTermMemory.append(outgoingMessage);
    sessionStore.append(agent.sessionId, outgoingMessage);
    await agent.notifyUpdate(outgoingMessage);

    return {
      content: outgoingMessage.content,
      message: outgoingMessage,
      parsed: response.parsed,
    };
  }
}
