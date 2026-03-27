import type { Agent } from "../agents/Agent.ts";
import type { Troupe } from "../troupes/Troupe.ts";

export class Registry {
  readonly #agents = new Map<string, Agent>();
  readonly #troupes = new Map<string, Troupe>();

  registerAgent(agent: Agent): void {
    this.#agents.set(agent.name, agent);
  }

  registerTroupe(troupe: Troupe): void {
    this.#troupes.set(troupe.name, troupe);
  }

  getAgent(name: string): Agent | undefined {
    return this.#agents.get(name);
  }

  getTroupe(name: string): Troupe | undefined {
    return this.#troupes.get(name);
  }

  getAgents(): Agent[] {
    return [...this.#agents.values()];
  }

  getTroupes(): Troupe[] {
    return [...this.#troupes.values()];
  }
}

export const globalRegistry = new Registry();
