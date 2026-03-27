import {
  Agent,
  DeepSeekProvider,
  GeminiProvider,
  OpenAIProvider,
  Troupe,
  type Message,
} from "troupejs";

export type PlaygroundNodeKind = "troupe" | "agent" | "subagent";

export interface PlaygroundNode {
  id: string;
  name: string;
  kind: PlaygroundNodeKind;
  parentId?: string;
  description: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  notes: string;
}

export interface PlaygroundConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: "gemini" | "openai" | "deepseek";
  temperature: number;
}

export interface RuntimeHandles {
  troupe: Troupe;
  topLevelAgentIds: string[];
  parentAgentBySubagentId: Map<string, Agent>;
}

export const troupeId = "support-inbox";
export const replyWriterId = "reply-writer";

export const defaultConfig: PlaygroundConfig = {
  apiKey: "",
  baseUrl: "",
  model: "gemini-3-flash-preview",
  provider: "gemini",
  temperature: 0.3,
};

export const initialPlaygroundNodes: PlaygroundNode[] = [
  {
    id: troupeId,
    name: "support-inbox",
    kind: "troupe",
    description:
      "Coordinates a small customer-support troupe and routes requests across specialized agents.",
    systemPrompt:
      "Coordinate specialists, preserve shared context, and make sure the final answer stays brief and actionable.",
    model: "gemini-3-flash-preview",
    temperature: 0.3,
    notes:
      "Click the troupe to inspect the shared timeline and run a full multi-agent pass on the current prompt.",
  },
  {
    id: "triage-lead",
    name: "triage-lead",
    kind: "agent",
    parentId: troupeId,
    description:
      "Reads the incoming request, classifies urgency, and frames the support strategy.",
    systemPrompt:
      "Extract the core issue, urgency, and customer emotion. Recommend the right response tone before drafting.",
    model: "gemini-3-flash-preview",
    temperature: 0.3,
    notes:
      "Use this agent to summarize the ticket, clarify urgency, or sharpen the operator understanding.",
  },
  {
    id: "policy-checker",
    name: "policy-checker",
    kind: "agent",
    parentId: troupeId,
    description:
      "Checks what the support team can promise and spots risky wording before the reply is sent.",
    systemPrompt:
      "Never promise an unsupported outcome. Translate policy and operational constraints into safe guidance.",
    model: "gemini-3-flash-preview",
    temperature: 0.2,
    notes:
      "Best for entitlement questions, escalation wording, and operational safety checks.",
  },
  {
    id: "billing-auditor",
    name: "billing-auditor",
    kind: "subagent",
    parentId: "policy-checker",
    description:
      "A private subagent for billing edge cases, sync delays, and plan-activation anomalies.",
    systemPrompt:
      "Focus on the most likely billing-side cause first. Return only the operator conclusion that matters.",
    model: "gemini-3-flash-preview",
    temperature: 0.1,
    notes:
      "This subagent is private to the policy checker, but the playground lets you message it directly for inspection.",
  },
  {
    id: "reply-writer",
    name: "reply-writer",
    kind: "agent",
    parentId: troupeId,
    description:
      "Turns the troupe output into a short customer-facing answer.",
    systemPrompt:
      "Write concise, calm support emails. Lead with clarity, set expectations, and end with the next action.",
    model: "gemini-3-flash-preview",
    temperature: 0.4,
    notes:
      "Best for rewriting, shortening, and polishing the final support response.",
  },
];

function buildTroupeAwareness(
  troupeNode: PlaygroundNode,
  nodes: PlaygroundNode[],
): string {
  const topLevelAgents = nodes.filter(
    (node) => node.kind === "agent" && node.parentId === troupeNode.id,
  );
  const subagents = nodes.filter((node) => node.kind === "subagent");
  const agentRoster = topLevelAgents
    .map((node) => `- ${node.name}: ${node.description}`)
    .join("\n");
  const subagentRoster = subagents.length
    ? subagents
      .map((node) => {
        const parent = node.parentId
          ? nodes.find((parentNode) => parentNode.id === node.parentId)
          : null;
        const parentLabel = parent ? ` (subagent to ${parent.name})` : " (subagent)";
        return `- ${node.name}${parentLabel}: ${node.description}`;
      })
      .join("\n")
    : "";

  return [
    `You are part of the "${troupeNode.name}" troupe.`,
    "",
    "Other agents in your troupe:",
    agentRoster || "- None",
    subagentRoster ? "" : undefined,
    subagentRoster ? "Subagents (private to their parent):" : undefined,
    subagentRoster || undefined,
    "",
    "Coordination rules:",
    "- Only reply if your role is relevant to the current request.",
    "- If another agent already covered your point, do not repeat it.",
    "- If you have nothing to add, return an empty reply.",
    "- You may reference other agents by name and build on their points.",
    "",
    "Hard response rules:",
    "- If you are NOT the reply-writer, do NOT draft a customer email.",
    "- Provide short internal notes only (2-5 bullets, max 80 words).",
    "- If you need missing information, you MUST ask via a tool.",
    "- Prefer ask_quick_question for one specialist; ask_next_round for group input.",
    "",
    "Available tools:",
    "- ask_next_round: queue a troupe-wide question for the next round.",
    "- ask_quick_question: ask a single, targeted question to one agent.",
  ]
    .filter(Boolean)
    .join("\n");
}

function createProvider(
  config: PlaygroundConfig,
  model: string,
  temperature: number,
) {
  if (config.provider === "openai") {
    return new OpenAIProvider({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || undefined,
      model,
      temperature,
    });
  }

  if (config.provider === "deepseek") {
    return new DeepSeekProvider({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || undefined,
      model,
      temperature,
    });
  }

  return new GeminiProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl || undefined,
    model,
    temperature,
  });
}

export function buildRuntime(
  nodes: PlaygroundNode[],
  config: PlaygroundConfig,
  onAgentUpdate: (node: PlaygroundNode, message: Message) => void,
): RuntimeHandles {
  const topLevelAgentIds: string[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const troupeNode = nodeById.get(troupeId);

  if (!troupeNode) {
    throw new Error("Missing troupe node definition.");
  }

  const troupeAwareness = buildTroupeAwareness(troupeNode, nodes);

  const topLevelAgents = nodes
    .filter((node) => node.kind === "agent" && node.parentId === troupeId)
    .map((node) => {
      const provider = createProvider(config, node.model, node.temperature);
      const agent = new Agent({
        name: node.name,
        systemPrompt: `${troupeAwareness}\n\n${node.systemPrompt}`,
        modelConfig: { provider },
        callbacks: {
          onUpdate({ newMessage }) {
            onAgentUpdate(node, newMessage);
          },
        },
      });

      topLevelAgentIds.push(node.id);
      return { agent, node };
    });

  const agentById = new Map(topLevelAgents.map((entry) => [entry.node.id, entry.agent]));
  const agentByName = new Map(topLevelAgents.map((entry) => [entry.node.name, entry.agent]));
  const parentAgentBySubagentId = new Map<string, Agent>();

  for (const subagentNode of nodes.filter((node) => node.kind === "subagent")) {
    const parentNode = subagentNode.parentId
      ? nodeById.get(subagentNode.parentId)
      : undefined;

    if (!parentNode) {
      continue;
    }

    const parentAgent = agentById.get(parentNode.id) ?? agentByName.get(parentNode.name);

    if (!parentAgent) {
      continue;
    }

    const provider = createProvider(config, subagentNode.model, subagentNode.temperature);

    parentAgent.addSubAgent({
      name: subagentNode.name,
      systemPrompt: subagentNode.systemPrompt,
      modelConfig: { provider },
      callbacks: {
        onUpdate({ newMessage }) {
          onAgentUpdate(subagentNode, newMessage);
        },
      },
    });

    parentAgentBySubagentId.set(subagentNode.id, parentAgent);
  }

  const troupe = new Troupe({
    name: troupeNode.name,
    troupeDescription: troupeNode.description,
    agents: topLevelAgents.map((entry) => entry.agent),
    conversation: {
      enabled: true,
      maxRounds: 6,
      maxParticipants: 4,
      maxNextRoundQuestions: 8,
      maxQuickQuestions: 10,
      maxQuickQuestionTargets: 2,
      maxContextMessages: 12,
    },
  });

  return {
    troupe,
    topLevelAgentIds,
    parentAgentBySubagentId,
  };
}
