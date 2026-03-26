# Tutorial: Philosophical Troupe

This tutorial builds a small troupe of agents that discuss a philosophical question:

`Is it better to be happy or to know the truth?`

The example uses:

- multiple agents with different roles
- subagents for private delegation
- a shared troupe discussion
- one dedicated note-taking agent with persistent memory
- prefixed memory so one persistent store can be shared without collisions

## Scenario

We will create:

- `moderator`
  Keeps the discussion structured.

- `noter`
  Stores durable notes from the conversation.

- `stoic`
  Pushes toward discipline, truth, and inner stability.

- `existentialist`
  Pushes toward freedom, ambiguity, and lived meaning.

- `historian`
  Brings philosophical context.

The `historian` agent has two private subagents:

- `plato-reader`
- `nietzsche-reader`

Those subagents are not troupe members. They help the historian prepare better answers.

## Persistent Notes

Only the `noter` agent uses long-term memory in this example.

```ts
import { StoredMemory } from "troupejs";

const notesMemory = new StoredMemory("./philosophy-notes.json");
```

Example prefix:

- `noter`

## Tools

We will use one small tool for bringing in short source notes.

```ts
import { z } from "zod";
import { Tool } from "troupejs";

const quoteArchive = new Tool({
  name: "quoteArchive",
  description: "Return short philosophical notes for a topic",
  inputSchema: z.object({
    topic: z.string(),
  }),
  async function({ topic }) {
    if (topic === "truth") {
      return {
        notes: [
          "Truth is often treated as a value even when it is uncomfortable.",
          "Some traditions value wisdom above pleasure.",
        ],
      };
    }

    if (topic === "happiness") {
      return {
        notes: [
          "Some traditions define the good life in terms of flourishing.",
          "Pleasure and happiness are not always treated as the same thing.",
        ],
      };
    }

    return { notes: ["No note found for that topic."] };
  },
});
```

## Agents

```ts
import { Agent } from "troupejs";

const moderator = new Agent({
  name: "moderator",
  personality: "Calm, structured, neutral",
  systemPrompt:
    "Guide the discussion, compare positions, and keep everyone on topic.",
  modelConfig,
});

const noter = new Agent({
  name: "noter",
  personality: "Organized, concise, reliable",
  systemPrompt:
    "Write durable notes about the strongest arguments and unresolved disagreements.",
  longTermMemory: notesMemory,
  memoryPrefix: "noter",
  modelConfig,
});

const stoic = new Agent({
  name: "stoic",
  personality: "Disciplined, clear, morally serious",
  systemPrompt:
    "Argue from a stoic point of view. Value truth, virtue, and self-command.",
  modelConfig,
  tools: [quoteArchive],
});

const existentialist = new Agent({
  name: "existentialist",
  personality: "Reflective, questioning, intense",
  systemPrompt:
    "Argue from an existentialist point of view. Focus on freedom, choice, and lived meaning.",
  modelConfig,
  tools: [quoteArchive],
});

const historian = new Agent({
  name: "historian",
  personality: "Context-rich, careful, comparative",
  systemPrompt:
    "Explain how major philosophers have framed the question over time.",
  modelConfig,
  tools: [quoteArchive],
});
```

These agents do not set `shortTermMemory`, so each one gets a `RuntimeMemory()` automatically.

## Subagents

Now create the historian's private helpers.

```ts
const platoReader = historian.addSubAgent({
  name: "plato-reader",
  personality: "Precise, classical, analytic",
  systemPrompt:
    "Summarize what a Platonic view would emphasize about truth and the good life.",
  modelConfig,
});

const nietzscheReader = historian.addSubAgent({
  name: "nietzsche-reader",
  personality: "Provocative, skeptical, sharp",
  systemPrompt:
    "Summarize what Nietzsche might challenge in moralized claims about truth.",
  modelConfig,
});
```

The subagents are private. They do not speak in the troupe unless the historian forwards something from them.

## Troupe

```ts
import { Troupe } from "troupejs";

const philosophyCircle = new Troupe({
  name: "philosophy-circle",
  troupeDescription: "Agents discussing philosophical questions",
  agents: [moderator, noter, stoic, existentialist, historian],
});
```

## Run A Discussion

```ts
await philosophyCircle.send(
  "Discuss this question: Is it better to be happy or to know the truth?"
);
```

What happens next:

- every troupe member receives the same troupe-wide message
- they think in parallel
- each agent decides whether it has something useful to say
- replies are posted in sequence

The historian can also use its private subagents during its own reasoning:

```ts
await historian.sendToSubagent(
  "plato-reader",
  "Give me a short Platonic argument for why truth matters more than comfort."
);

await historian.sendToSubagent(
  "nietzsche-reader",
  "Give me a short Nietzschean objection to treating truth as an unconditional good."
);
```

After that, the historian can return to the troupe discussion with a better-informed response.

## A More Structured Round

You can also make the moderator run the troupe in stages.

```ts
await philosophyCircle.send(
  "Round 1: each agent state its position in 4 sentences or fewer."
);

await philosophyCircle.send(
  "Round 2: challenge one claim from another agent without repeating their full argument."
);

await philosophyCircle.send(
  "Round 3: moderator summarize the strongest points from both sides."
);

await philosophyCircle.send(
  "Round 4: noter record the strongest claims and open questions."
);
```

This pattern works well because troupe members are allowed to stay silent when a round is not relevant to them.

## Why This Setup Works

- the troupe is public collaboration
- the subagents are private specialization
- only the note-taking agent persists long-term information
- agents do not have to answer every troupe message
- the moderator can shape the discussion without being the only voice

## Next Steps

After this tutorial, the most useful references are:

- [`agents.md`](./agents.md)
- [`memory.md`](./memory.md)
- [`troupes.md`](./troupes.md)

