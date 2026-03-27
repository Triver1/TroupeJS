# Agents

Agents are the main abstraction in TroupeJS.

## Creating An Agent

```ts
const agent = new Agent({
  name: "assistant",
  personality: "Helpful and direct",
  systemPrompt: "You are an assistant agent.",
  modelConfig,
  tools: [summarize],
  callbacks: {
    onUpdate({ history, newMessage }) {
      console.log("Agent updated", history.length, newMessage);
    },
  },
});
```

## Agent Fields

- `name`
- `personality`
- `systemPrompt`
- `shortTermMemory`
- `longTermMemory`
- `memoryPrefix`
- `modelConfig`
- `tools`
- `callbacks` (optional)

See [`memory.md`](./memory.md) for memory roles and [`model-config.md`](./model-config.md) for model setup.

## Memory Roles

- `shortTermMemory`
  The current conversation, active reasoning context, and recent tool history.

- `longTermMemory`
  Facts, notes, preferences, and state that persist across runs.

### Short-Term Memory

`shortTermMemory` is runtime-oriented. It owns the active chat thread and is what powers `getChat()`.

Default:

- `new RuntimeMemory()`
  In-memory storage that exists only during runtime.

Default behavior:

- if `shortTermMemory` is omitted, the agent uses `new RuntimeMemory()`
- the main agent keeps its own active thread
- subagents use their own `shortTermMemory`
- parent to subagent communication is recorded in the subagent's thread

### Long-Term Memory

`longTermMemory` is persistence-oriented. It stores durable facts, notes, preferences, and state across runs.

Default behavior:

- if `longTermMemory` is omitted, no persistent memory is used
- subagents can write into shared memory stores by using their own prefixes

### Memory Prefix

`memoryPrefix` namespaces an agent's stored data inside a memory backend.

When multiple agents share one memory store, each agent uses its own prefix.

Subagents can share the same backing store as the parent by using nested prefixes such as:

- `historian`
- `historian/plato-reader`
- `historian/nietzsche-reader`

## Agent API

API:

- `respond(input)`
  Sends input to the agent, makes it think, and returns the agent's response.

- `getChat()`
  Returns the current history from `shortTermMemory`.

- `addSubAgent(config)`
  Creates a subagent from config, attaches it to the parent, and returns it.

- `sendToSubagent(name, message)`
  Sends a directed message to one of the agent's subagents.

- `sendToAgent(name, message)`
  Sends a directed message to another registered agent by name.

## Callbacks

Callbacks run after the agent updates.

They are for observing agent behavior, logging, or connecting the agent to application code.

```ts
const agent = new Agent({
  name: "logger",
  modelConfig,
  callbacks: {
    onUpdate({ history, newMessage }) {
      console.log(history, newMessage);
    },
  },
});
```

Rule:

- callbacks observe the result

## Subagents

Subagents are full agents owned by another agent.

They are used for private delegation inside a single agent workflow.

Examples:

- a planner subagent
- a research subagent
- a critic subagent

### Default Rules

1. A subagent is a normal agent object.
2. A subagent belongs to exactly one parent agent.
3. A subagent has its own configuration.
4. A subagent uses its own `shortTermMemory`.
5. A subagent can use its own memory stores or share prefixed stores with its parent.
6. A subagent is private to its parent unless explicitly added to a `troupe`.

These defaults make delegation easy while still allowing overrides.

### Creating Subagents

Subagents are created by calling `agent.addSubAgent()`.

```ts
const manager = new Agent({
  name: "manager",
  personality: "Coordinates work",
  systemPrompt: "Delegate work when it helps.",
  modelConfig,
});

const planner = manager.addSubAgent({
  name: "planner",
  personality: "Structured and strategic",
  systemPrompt: "Break problems into steps.",
  modelConfig,
});
```

Another example:

```ts
const reviewer = manager.addSubAgent({
  name: "reviewer",
  personality: "Critical and detail-oriented",
  systemPrompt: "Review outputs for problems.",
});
```

The parent creates the subagent through `addSubAgent()`. The framework does not copy `modelConfig` from the parent.

### Parent To Subagent Communication

A parent agent communicates with subagents through directed internal messages.

```ts
await manager.sendToSubagent("reviewer", "Review the latest draft.");
```

## Agent To Agent Communication

Agents can also send directed messages to other registered agents.

```ts
await manager.sendToAgent("researcher", "Give me the strongest counterargument.");
```

Rules:

- target agents are resolved by registered name
- directed replies come back from the target agent only

### Subagent Behavior

Behavior:

- the parent sends a task message
- the subagent receives the task in its own `shortTermMemory`
- the subagent responds like any other agent
- the subagent returns a response or result to the parent
- the parent decides to use that result, store it, or continue reasoning

Subagent communication is private by default. It does not appear in a `troupe` unless explicitly forwarded there.

## Agent Routing

Routing decides how an agent handles incoming work.

When an agent receives work, it chooses one of three actions:

1. Handle it directly
2. Delegate it to a subagent
3. Forward it into a `troupe`

### Directed Messages

Directed messages always go to the named target.

Examples:

- parent to subagent
- one troupe member to another
- application code to a specific agent

Directed messages are handled only by the target agent.

### Troupe Messages

Troupe messages are visible to the troupe.

Not every agent answers them.

Routing and reply rules are defined in [`troupes.md`](./troupes.md).

### Eligibility Rules

Eligibility checks:

- the message is explicitly addressed to the agent
- the message matches the agent's role or specialty
- the agent has tools or subagents relevant to the task
- the agent has not already responded to the same message

Delegation to a subagent happens when:

- the task matches the subagent's specialty
- the parent wants a separate reasoning thread
- the parent wants to keep the main conversation cleaner

### Loop Prevention

To avoid useless back-and-forth behavior:

- an agent does not answer the same message twice unless re-triggered
- a parent does not repeatedly delegate the same task to the same subagent
- a troupe member does not immediately echo another agent's message unless it adds new value
- routing metadata tracks message IDs, parent IDs, and handled-by history
