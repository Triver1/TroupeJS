# Docs Index

TroupeJS is a TypeScript-first framework for building agentic applications with a high level of abstraction.

The goal is to give developers an intuitive way to work with LLMs without rebuilding the same patterns for memory, tools, delegation, and multi-agent communication in every project.

TroupeJS feels like working with agents directly, not stitching together raw model calls by hand.

## Design Principles

- High-level API, small mental model
- Typed tools and typed inputs
- Simple defaults, explicit overrides
- Agents first, model calls second
- Private delegation through subagents
- Shared coordination through troupes

## Quick Example

```ts
import { z } from "zod";
import {
  Agent,
  Tool,
} from "troupejs";

const searchWeb = new Tool({
  name: "searchWeb",
  description: "Search the web for recent information",
  inputSchema: z.object({
    query: z.string(),
  }),
  async function({ query }) {
    return { results: [`Result for ${query}`] };
  },
});

const researcher = new Agent({
  name: "researcher",
  personality: "Curious, careful, concise",
  systemPrompt: "You are a research agent.",
  modelConfig: {
    provider: "openai",
    model: "gpt-4.1",
    apiKey: process.env.OPENAI_API_KEY,
    retryPolicy: { maxRetries: 2, delayMs: 500 },
    temperature: 0.2,
  },
  tools: [searchWeb],
});

const answer = await researcher.respond(
  "Find recent information about battery recycling."
);

console.log(answer);
console.log(researcher.getChat());
```

## Docs Map

- [`agents.md`](./agents.md)
  Agent creation, API shape, callbacks, subagents, and routing.

- [`tools.md`](./tools.md)
  How typed tools are defined.

- [`memory.md`](./memory.md)
  Built-in memory objects, memory roles, and custom memory notes.

- [`model-config.md`](./model-config.md)
  Provider-agnostic model configuration.

- [`troupes.md`](./troupes.md)
  Shared multi-agent collaboration.

- [`example-troupe.md`](./example-troupe.md)
  End-to-end tutorial for a troupe of agents discussing a philosophical question.

## Practical Defaults

- Agents use `RuntimeMemory()` for `shortTermMemory` by default.
- Agents use no `longTermMemory` unless one is provided.
- Subagents get a fresh `shortTermMemory` by default.
- Subagents are private unless explicitly added to a troupe.
- Callbacks observe updates.
