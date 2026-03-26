import { AgentError, ProviderError } from "../../lib/errors.ts";
import type { Message, MessageScope } from "../messages/Message.ts";
import { RuntimeMemory } from "../memory/RuntimeMemory.ts";
import type { MemoryStore } from "../memory/MemoryStore.ts";
import type { Tool } from "../tools/Tool.ts";
import { globalRegistry } from "../execution/Registry.ts";
import { sessionStore } from "../execution/SessionStore.ts";
import { AgentExecutor, type AgentResponseEnvelope } from "../execution/AgentExecutor.ts";
import { BaseProvider } from "../../providers/llm/BaseProvider.ts";

export interface AgentCallbacks {
  onUpdate?: (payload: {
    agent: Agent;
    history: Message[];
    newMessage: Message;
  }) => void | Promise<void>;
}

export interface AgentModelConfig {
  provider: BaseProvider;
}

export interface AgentConfig {
  name: string;
  personality?: string;
  systemPrompt?: string;
  shortTermMemory?: RuntimeMemory;
  longTermMemory?: MemoryStore<unknown>;
  memoryPrefix?: string;
  modelConfig?: AgentModelConfig;
  tools?: Tool[];
  callbacks?: AgentCallbacks;
}

export class Agent {
  readonly name: string;
  readonly personality?: string;
  readonly systemPrompt?: string;
  readonly shortTermMemory: RuntimeMemory;
  readonly longTermMemory?: MemoryStore<unknown>;
  readonly memoryPrefix: string;
  readonly modelConfig?: AgentModelConfig;
  readonly tools: Tool[];
  readonly callbacks?: AgentCallbacks;
  readonly sessionId: string;
  readonly parent?: Agent;

  readonly #subagents = new Map<string, SubAgent>();
  #provider?: BaseProvider;

  constructor(config: AgentConfig, parent?: Agent) {
    this.name = config.name;
    this.personality = config.personality;
    this.systemPrompt = config.systemPrompt;
    this.shortTermMemory = config.shortTermMemory ?? new RuntimeMemory();
    this.longTermMemory = config.longTermMemory;
    this.memoryPrefix =
      config.memoryPrefix ??
      (parent
        ? `${parent.memoryPrefix}/${config.name}`
        : config.name);
    this.modelConfig = config.modelConfig;
    this.tools = [...(config.tools ?? [])];
    this.callbacks = config.callbacks;
    this.parent = parent;
    this.sessionId = sessionStore.createSession("agent", this.name);
    globalRegistry.registerAgent(this);
  }

  async respond(input: string, options: RespondOptions = {}): Promise<string | null> {
    const result = await AgentExecutor.respond(this, input, options);
    return result.content;
  }

  getChat(): Message[] {
    return this.shortTermMemory.getChat();
  }

  addSubAgent(config: AgentConfig): SubAgent {
    const subagent = new SubAgent(config, this);

    if (this.#subagents.has(subagent.name)) {
      throw new AgentError(
        `Subagent "${subagent.name}" already exists on agent "${this.name}"`,
      );
    }

    this.#subagents.set(subagent.name, subagent);
    return subagent;
  }

  getSubAgent(name: string): SubAgent | undefined {
    return this.#subagents.get(name);
  }

  getSubAgents(): SubAgent[] {
    return [...this.#subagents.values()];
  }

  async sendToSubagent(name: string, message: string): Promise<string | null> {
    const subagent = this.getSubAgent(name);

    if (!subagent) {
      throw new AgentError(`Unknown subagent "${name}" on agent "${this.name}"`);
    }

    const result = await AgentExecutor.respond(subagent, message, {
      sender: this.name,
      target: subagent.name,
      scope: "directed",
    });

    return result.content;
  }

  async loadLongTermMemory(): Promise<unknown> {
    if (!this.longTermMemory) {
      return null;
    }

    return this.longTermMemory.load(this.memoryPrefix);
  }

  async saveLongTermMemory(value: unknown): Promise<void> {
    if (!this.longTermMemory) {
      return;
    }

    await this.longTermMemory.save(this.memoryPrefix, value);
  }

  resolveProvider(): BaseProvider {
    if (this.#provider) {
      return this.#provider;
    }

    const config = this.modelConfig;
    if (!config) {
      throw new ProviderError(`Agent "${this.name}" has no modelConfig`);
    }

    this.#provider = config.provider;
    return this.#provider;
  }

  async notifyUpdate(newMessage: Message): Promise<void> {
    if (!this.callbacks?.onUpdate) {
      return;
    }

    await this.callbacks.onUpdate({
      agent: this,
      history: this.getChat(),
      newMessage,
    });
  }
}

export class SubAgent extends Agent {
  constructor(config: AgentConfig, parent: Agent) {
    super(config, parent);
  }
}

export interface RespondOptions {
  sender?: string;
  target?: string;
  scope?: MessageScope;
  parentId?: string;
}

export type { AgentResponseEnvelope };

