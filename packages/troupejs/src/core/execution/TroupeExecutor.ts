import { TroupeError } from "../../lib/errors.ts";
import type { Agent } from "../agents/Agent.ts";
import type { Message } from "../messages/Message.ts";
import { createMessage } from "../messages/Message.ts";
import type {
  Troupe,
  TroupeConversationConfig,
} from "../troupes/Troupe.ts";
import { Tool } from "../tools/Tool.ts";
import type { BaseProvider } from "../../providers/llm/BaseProvider.ts";
import { AgentExecutor } from "./AgentExecutor.ts";
import { sessionStore } from "./SessionStore.ts";

const DEFAULT_CONVERSATION_CONFIG: Required<TroupeConversationConfig> = {
  routerName: "",
  maxRounds: 5,
  maxParticipants: 4,
  maxNextRoundQuestions: 6,
  maxContextMessages: 10,
};

const activeRunByAgent = new WeakMap<Agent, ConversationRunContext>();

interface RoundRequest {
  content: string;
  sender: string;
  targets?: string[];
  kind: "main" | "sub";
}

interface ConversationRunContext {
  troupe: Troupe;
  config: Required<TroupeConversationConfig>;
  nextRoundQueue: RoundRequest[];
  scheduledRounds: number;
  hitRoundLimit: boolean;
  askGroup: (from: Agent, input: AskGroupInput) => ToolResult;
}

interface ToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

interface AskGroupInput {
  question?: string;
}

interface PostOutboundInput {
  content?: string;
}

function mergeConversationConfig(
  config?: TroupeConversationConfig,
): Required<TroupeConversationConfig> {
  return {
    ...DEFAULT_CONVERSATION_CONFIG,
    ...(config ?? {}),
  };
}

function formatTroupeTranscript(
  messages: Message[],
  maxContextMessages: number,
): string {
  return messages
    .slice(-maxContextMessages)
    .map((message) => {
      const speaker =
        message.role === "user"
          ? message.sender ?? "user"
          : message.sender ?? message.role;
      return `${speaker}: ${message.content}`;
    })
    .join("\n");
}

function getAgentNames(troupe: Troupe): string[] {
  return troupe.getAgents().map((agent) => agent.name);
}

function createAskGroupTool(agent: Agent): Tool<AskGroupInput, ToolResult> {
  return new Tool({
    name: "askGroup",
    description:
      "Ask the troupe a question for the next round. Use when you need group input.",
    historyMode: "steering",
    historyFormatter: (output) => {
      if (!output.ok) {
        return `Conversation update: group question failed (${output.message}).`;
      }
      return "Conversation update: queued a group question for the next round.";
    },
    function: (input) => {
      const context = activeRunByAgent.get(agent);
      if (!context) {
        return { ok: false, message: "No active troupe run." };
      }

      return context.askGroup(agent, input);
    },
  });
}

function createPostOutboundTool(
  troupe: Troupe,
  agent: Agent,
): Tool<PostOutboundInput, ToolResult> {
  return new Tool({
    name: "post_outbound",
    description:
      "Post an outbound message from the troupe (final response or external reply).",
    historyMode: "hidden",
    function: (input) => {
      const content = input.content?.trim();
      if (!content) {
        return { ok: false, message: "Missing content." };
      }

      const outboundMessage = createMessage({
        role: "agent",
        content,
        sender: agent.name,
        scope: "troupe",
        metadata: {
          channel: "outbound",
        },
      });

      sessionStore.append(troupe.sessionId, outboundMessage);

      return { ok: true, message: "Outbound message posted." };
    },
  });
}

function ensureConversationTools(agent: Agent, troupe: Troupe): void {
  const toolNames = new Set(agent.tools.map((tool) => tool.name));
  if (!toolNames.has("askGroup")) {
    agent.tools.push(createAskGroupTool(agent));
  }
  if (!toolNames.has("post_outbound")) {
    agent.tools.push(createPostOutboundTool(troupe, agent));
  }
}

async function runRouter(
  provider: BaseProvider,
  agentName: string,
  longTermMemory: unknown,
  question: string,
  roster: string[],
  maxParticipants: number,
): Promise<string[]> {
  const routerPrompt = [
    "You are a router selecting which agents should respond.",
    "Return ONLY a JSON array of agent names.",
    `Pick at most ${maxParticipants} agents.`,
    "If none are relevant, return []",
    "",
    "Agent roster:",
    ...roster.map((line) => `- ${line}`),
  ].join("\n");
  const response = await provider.generate({
    agentName,
    systemPrompt: routerPrompt,
    input: question,
    scope: "troupe",
    messages: [],
    tools: [],
    subagentNames: [],
    longTermMemory,
    responseSchema: {
      name: "RouterSelection",
      schema: {
        type: "array",
        items: { type: "string" },
        minItems: 0,
        maxItems: Math.max(1, maxParticipants),
      },
      strict: true,
    },
  });

  const parsed = response.parsed;
  if (Array.isArray(parsed)) {
    return parsed
      .filter((name): name is string => typeof name === "string")
      .filter((name) => roster.includes(name));
  }

  return [];
}

function buildRosterDescriptions(troupe: Troupe): string[] {
  return troupe
    .getAgents()
    .map((agent) => `${agent.name}: ${agent.systemPrompt ?? "agent"}`);
}

function summarizeRole(prompt?: string): string {
  if (!prompt) {
    return "No role description.";
  }

  const firstLine = prompt.split("\n").find((line) => line.trim().length > 0) ?? prompt;
  const sentence = firstLine.split(/[.!?]/)[0] ?? firstLine;
  const trimmed = sentence.trim();
  if (trimmed.length === 0) {
    return "No role description.";
  }
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

function buildTroupeSystemFrame(troupe: Troupe, agent: Agent): string {
  const others = troupe.getAgents().filter((member) => member.name !== agent.name);
  const roster = others.length > 0
    ? others
      .map((member) => `- ${member.name}: ${summarizeRole(member.systemPrompt)}`)
      .join("\n")
    : "- None";

  return [
    `You are collaborating in the troupe "${troupe.name}".`,
    "Other agents and roles:",
    roster,
    "",
    "Coordination rules:",
    "- Only reply if your role is relevant.",
    "- Do not repeat points already covered by other agents.",
    "- If you need missing info, use tools instead of guessing.",
    "- If the troupe needs another pass, use askGroup to ask the whole group a focused follow-up question.",
    "- Provide short internal notes by default.",
    "- Use post_outbound only when you're ready to publish an outbound message.",
  ].join("\n");
}

async function resolveParticipants(
  troupe: Troupe,
  round: RoundRequest,
  config: Required<TroupeConversationConfig>,
): Promise<Agent[]> {
  const agents = troupe.getAgents();
  if (round.targets?.length) {
    const targeted = agents.filter((agent) => round.targets?.includes(agent.name));
    return targeted.slice(0, config.maxParticipants);
  }

  const roster = buildRosterDescriptions(troupe);
  const routerName = config.routerName?.trim();
  const routerAgent = routerName
    ? troupe.getAgent(routerName)
    : undefined;
  let selection: string[] = [];

  if (routerAgent) {
    selection = await runRouter(
      routerAgent.resolveProvider(),
      routerAgent.name,
      await routerAgent.loadLongTermMemory(),
      round.content,
      roster,
      config.maxParticipants,
    );
  } else if (agents[0]) {
    selection = await runRouter(
      agents[0].resolveProvider(),
      "troupe-router",
      null,
      round.content,
      roster,
      config.maxParticipants,
    );
  }

  if (selection.length === 0) {
    return agents.slice(0, config.maxParticipants);
  }

  return agents
    .filter((agent) => selection.includes(agent.name))
    .slice(0, config.maxParticipants);
}

async function runRound(
  troupe: Troupe,
  round: RoundRequest,
  participants: Agent[],
  config: Required<TroupeConversationConfig>,
  options?: {
    conversation?: ConversationRunContext;
    allowToolCalls?: boolean;
  },
): Promise<Message[]> {
  const roundMessage = createMessage({
    role: "user",
    content: round.content,
    sender: round.sender,
    scope: "troupe",
  });

  sessionStore.append(troupe.sessionId, roundMessage);

  const transcript = formatTroupeTranscript(
    troupe.getMessages().slice(0, -1),
    config.maxContextMessages,
  );
  const contextualInput = transcript.length > 0
    ? `Recent troupe conversation:\n${transcript}\n\nMessage from ${round.sender}:\n${round.content}`
    : round.content;

  const results = await Promise.all(
    participants.map(async (agent, index) => {
      const response = await AgentExecutor.respond(agent, contextualInput, {
        sender: round.sender,
        scope: "troupe",
        parentId: roundMessage.id,
        allowToolCalls: options?.allowToolCalls ?? (options?.conversation ? true : undefined),
        promptPrefix: buildTroupeSystemFrame(troupe, agent),
      });

      return { index, message: response.message };
    }),
  );

  const replies = results
    .sort((left, right) => left.index - right.index)
    .map((result) => result.message)
    .filter((message): message is Message => message !== null);

  for (const reply of replies) {
    sessionStore.append(troupe.sessionId, reply);
  }

  return replies;
}

function buildFinalAnswerPrompt(troupe: Troupe): string {
  const transcript = formatTroupeTranscript(
    troupe.getMessages().filter((message) => message.role !== "tool"),
    Number.MAX_SAFE_INTEGER,
  );

  return [
    "The max amount of rounds is finished.",
    "Write one final answer based on the conversation so far.",
    "",
    "Conversation:",
    transcript,
  ].join("\n");
}

export class TroupeExecutor {
  static async send(troupe: Troupe, content: string): Promise<Message[]> {
    const config = mergeConversationConfig(troupe.conversation);

    for (const agent of troupe.getAgents()) {
      ensureConversationTools(agent, troupe);
    }

    const runContext: ConversationRunContext = {
      troupe,
      config,
      nextRoundQueue: [],
      scheduledRounds: 1,
      hitRoundLimit: false,
      askGroup: (from, input) => {
        if (!input.question || input.question.trim().length === 0) {
          return { ok: false, message: "Missing question." };
        }
        if (runContext.scheduledRounds >= config.maxRounds) {
          runContext.hitRoundLimit = true;
          return { ok: false, message: "Round limit reached." };
        }
        if (runContext.nextRoundQueue.length >= config.maxNextRoundQuestions) {
          return { ok: false, message: "Next-round queue is full." };
        }

        runContext.nextRoundQueue.push({
          content: input.question.trim(),
          sender: from.name,
          kind: "sub",
        });
        runContext.scheduledRounds += 1;
        return {
          ok: true,
          message: "Queued for next round.",
        };
      },
    };

    for (const agent of troupe.getAgents()) {
      activeRunByAgent.set(agent, runContext);
    }

    const queue: RoundRequest[] = [
      {
        content,
        sender: "user",
        kind: "main",
      },
    ];
    const allReplies: Message[] = [];
    let roundsProcessed = 0;

    while (queue.length > 0 && roundsProcessed < config.maxRounds) {
      const round = queue.shift();
      if (!round) {
        break;
      }

      roundsProcessed += 1;
      const participants = await resolveParticipants(troupe, round, config);
      const replies = await runRound(troupe, round, participants, config, {
        conversation: runContext,
      });
      allReplies.push(...replies);

      if (runContext.nextRoundQueue.length > 0) {
        queue.push(...runContext.nextRoundQueue.splice(0));
      }
    }

    if (roundsProcessed >= config.maxRounds && (runContext.hitRoundLimit || queue.length > 0)) {
      const finalRound: RoundRequest = {
        content: buildFinalAnswerPrompt(troupe),
        sender: "system",
        kind: "sub",
      };
      const participants = await resolveParticipants(troupe, finalRound, config);
      const finalReplies = await runRound(troupe, finalRound, participants, config, {
        allowToolCalls: false,
      });
      allReplies.push(...finalReplies);
    }

    for (const agent of troupe.getAgents()) {
      activeRunByAgent.delete(agent);
    }

    return allReplies;
  }

  static async sendTo(
    troupe: Troupe,
    agentName: string,
    content: string,
  ): Promise<Message | null> {
    const agent = troupe.getAgent(agentName);
    if (!agent) {
      throw new TroupeError(
        `Agent "${agentName}" is not part of troupe "${troupe.name}"`,
      );
    }

    const directedMessage = createMessage({
      role: "user",
      content,
      sender: "user",
      target: agentName,
      scope: "directed",
    });

    sessionStore.append(troupe.sessionId, directedMessage);

    const response = await AgentExecutor.respond(agent, content, {
      sender: "user",
      target: agentName,
      scope: "directed",
      parentId: directedMessage.id,
    });

    if (response.message) {
      sessionStore.append(troupe.sessionId, response.message);
    }

    return response.message;
  }
}
