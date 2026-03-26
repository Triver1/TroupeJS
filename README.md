![TroupeJS Header](./assets/header.png)

# TroupeJS

TroupeJS is a TypeScript library for building multi-agent applications with minimal setup and configuration.

It provides a clean, class-based API for creating agents that can communicate, collaborate, and reason together. At the same time, it supports more advanced capabilities like tools, structured discussions, and memory systems.

You can start simple and scale to more complex agent systems without changing the core design.

---

## Features

### 🧠 Troupes (Collaborative Agent Groups)
Create *troupes*, which are groups of agents that discuss and work together on a task.  
Agents run in parallel, share context, and produce structured responses.

### 🔁 Agent-to-Agent Communication
Agents can respond to each other and build on previous outputs, enabling more dynamic and iterative reasoning.

### 🧩 Subagents
Attach subagents to an agent to break problems into smaller parts.  
This supports hierarchical and modular workflows.

### 🛠 Tools Integration
Add tools (APIs, functions, external data) to agents using a simple typed interface.

### 🧼 Clean API
A straightforward class-based design (`Agent`, `Troupe`, `Tool`, etc.) keeps the system easy to understand and integrate.

### 🧠 Memory Systems
- **RuntimeMemory** for short-term context  
- Optional **StoredMemory** for persistence  

Supports both stateless and stateful applications.

### ⚡ Minimal Configuration
Get started with a few lines of code while keeping full control over models and behavior.

### 🔌 Multi-Provider Support
Supports multiple model providers such as OpenAI, Claude, and Gemini.

---

## Example

```ts
import { Agent, GeminiProvider, Troupe } from "troupejs";

const provider = new GeminiProvider({
  model: "gemini-3-flash-preview",
  apiKey: process.env.GEMINI_API_KEY!,
  temperature: 0.3,
});

const triageLead = new Agent({
  name: "triage-lead",
  systemPrompt:
    "You are a customer support lead. Identify the user's core issue, the requested outcome, and the tone we should use in the reply.",
  modelConfig: { provider },
});

const policyChecker = new Agent({
  name: "policy-checker",
  systemPrompt:
    "You check whether the response makes realistic promises. Only approve actions that a support team could actually take.",
  modelConfig: { provider },
});

const replyWriter = new Agent({
  name: "reply-writer",
  systemPrompt:
    "Write concise, friendly customer emails. Apologize when appropriate, answer directly, and end with a clear next step.",
  modelConfig: { provider },
});

const troupe = new Troupe({
  name: "support-inbox",
  agents: [triageLead, policyChecker, replyWriter],
});

await troupe.send(`
Review this customer email and decide how we should answer.

Customer email:
"Hi team, I upgraded to the Pro plan this morning but my workspace still shows Free.
I need the extra seats before a client demo in two hours. Can you help?"

Discuss the issue briefly first.
`);

const finalReply = await troupe.sendTo(
  "reply-writer",
  "Write the final customer reply in under 120 words.",
);

console.log(finalReply?.content);
```
