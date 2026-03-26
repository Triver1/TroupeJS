import { TroupeError } from "../../lib/errors.ts";
import { createId } from "../../lib/ids.ts";
import type { Agent } from "../agents/Agent.ts";
import type { Message } from "../messages/Message.ts";
import { globalRegistry } from "../execution/Registry.ts";
import { sessionStore } from "../execution/SessionStore.ts";
import { TroupeExecutor } from "../execution/TroupeExecutor.ts";

export interface TroupeConfig {
  name: string;
  troupeDescription?: string;
  agents?: Agent[];
}

export class Troupe {
  readonly name: string;
  readonly troupeDescription?: string;
  readonly sessionId: string;
  readonly #agents = new Map<string, Agent>();

  constructor(configOrAgents: TroupeConfig | Agent[]) {
    const config = Array.isArray(configOrAgents)
      ? { name: createId("troupe"), agents: configOrAgents }
      : configOrAgents;

    this.name = config.name;
    this.troupeDescription = config.troupeDescription;
    this.sessionId = sessionStore.createSession("troupe", this.name);

    for (const agent of config.agents ?? []) {
      this.addAgent(agent);
    }

    globalRegistry.registerTroupe(this);
  }

  addAgent(agent: Agent): void {
    if (this.#agents.has(agent.name)) {
      throw new TroupeError(
        `Agent "${agent.name}" is already in troupe "${this.name}"`,
      );
    }

    this.#agents.set(agent.name, agent);
  }

  removeAgent(agentName: string): void {
    this.#agents.delete(agentName);
  }

  getAgents(): Agent[] {
    return [...this.#agents.values()];
  }

  getAgent(agentName: string): Agent | undefined {
    return this.#agents.get(agentName);
  }

  getMessages(): Message[] {
    return sessionStore.getMessages(this.sessionId);
  }

  async send(message: string): Promise<Message[]> {
    return TroupeExecutor.send(this, message);
  }

  async sendTo(agentName: string, message: string): Promise<Message | null> {
    return TroupeExecutor.sendTo(this, agentName, message);
  }
}
