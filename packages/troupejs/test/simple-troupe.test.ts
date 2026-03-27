import test from "node:test";
import assert from "node:assert/strict";

import {
  Agent,
  BaseProvider,
  Tool,
  Troupe,
} from "../src/index.ts";
import type { MemoryStore, Message, ProviderRequest } from "../src/index.ts";

class MockProvider extends BaseProvider {
  async generate(request: {
    agentName: string;
    input: string;
    scope: "directed" | "troupe";
  }): Promise<{ content?: string; shouldReply?: boolean }> {
    if (request.agentName === "moderator") {
      return {
        content: "We should separate truth, comfort, and meaning before judging them.",
      };
    }

    if (request.agentName === "stoic") {
      return {
        content: "Truth matters more than comfort because a good life depends on seeing clearly.",
      };
    }

    if (request.agentName === "noter") {
      if (request.scope === "directed") {
        return {
          content: "Stored a note about the debate.",
        };
      }

      return { shouldReply: false };
    }

    if (request.agentName === "historian") {
      if (request.scope === "troupe") {
        return {
          content: "The tradition repeatedly separates pleasure from wisdom.",
        };
      }

      return { shouldReply: false };
    }

    if (request.agentName === "plato-reader") {
      return {
        content: "A Platonic view treats truth as part of the soul's proper orientation.",
      };
    }

    return { shouldReply: false };
  }
}

class RecordingMemory implements MemoryStore<unknown> {
  readonly values = new Map<string, unknown>();

  load(prefix: string): unknown {
    return this.values.get(prefix) ?? null;
  }

  save(prefix: string, value: unknown): void {
    this.values.set(prefix, value);
  }
}

class SteeringToolProvider extends BaseProvider {
  secondRequestMessages: Message[] = [];
  #calls = 0;

  async generate(request: ProviderRequest): Promise<{
    content?: string;
    shouldReply?: boolean;
    toolCalls?: Array<{ toolName: string; input: unknown; id?: string }>;
  }> {
    this.#calls += 1;

    if (this.#calls === 1) {
      return {
        content: "",
        toolCalls: [
          {
            id: "call_1",
            toolName: "conversation_steer",
            input: {},
          },
        ],
      };
    }

    this.secondRequestMessages = request.messages;
    return {
      content: "done",
    };
  }
}

class FinalAnswerProvider extends BaseProvider {
  prompts: string[] = [];

  async generate(request: ProviderRequest): Promise<{ content?: string; shouldReply?: boolean }> {
    this.prompts.push(request.input);

    if (request.input.includes("The max amount of rounds is finished.")) {
      return {
        content: "Final answer: summarize the conversation and conclude.",
      };
    }

    return {
      content: "Initial discussion note.",
    };
  }
}

class RoundLimitToolProvider extends BaseProvider {
  prompts: string[] = [];
  #calls = 0;

  async generate(request: ProviderRequest): Promise<{
    content?: string;
    shouldReply?: boolean;
    toolCalls?: Array<{ toolName: string; input: unknown; id?: string }>;
  }> {
    this.prompts.push(request.input);
    this.#calls += 1;

    if (request.input.includes("The max amount of rounds is finished.")) {
      return {
        content: "Final answer: summarize the conversation and conclude.",
      };
    }

    if (this.#calls === 1) {
      return {
        content: "",
        toolCalls: [
          {
            id: "call_1",
            toolName: "askGroup",
            input: {
              question: "What else should the group consider?",
            },
          },
        ],
      };
    }

    return {
      content: "Initial discussion note.",
    };
  }
}

test("a troupe discussion runs with subagents and optional long-term memory", async () => {
  const provider = new MockProvider();
  const notesMemory = new RecordingMemory();

  const moderator = new Agent({
    name: "moderator",
    systemPrompt: "Guide the discussion.",
    modelConfig: { provider },
  });

  const noter = new Agent({
    name: "noter",
    systemPrompt: "Store durable notes.",
    modelConfig: { provider },
    longTermMemory: notesMemory,
    memoryPrefix: "noter",
    callbacks: {
      async onUpdate({ agent, newMessage }) {
        if (newMessage.sender !== "noter") {
          return;
        }

        await agent.saveLongTermMemory({
          lastNote: newMessage.content,
        });
      },
    },
  });

  const stoic = new Agent({
    name: "stoic",
    systemPrompt: "Argue for truth and virtue.",
    modelConfig: { provider },
  });

  const historian = new Agent({
    name: "historian",
    systemPrompt: "Bring philosophical context.",
    modelConfig: { provider },
  });

  const platoReader = historian.addSubAgent({
    name: "plato-reader",
    systemPrompt: "Summarize Plato.",
    modelConfig: { provider },
  });

  assert.equal(platoReader.parent, historian);

  const troupe = new Troupe({
    name: "philosophy-circle",
    agents: [moderator, noter, stoic, historian],
  });

  const replies = await troupe.send(
    "Is it better to be happy or to know the truth?",
  );

  assert.deepEqual(
    replies.map((reply) => reply.sender),
    ["moderator", "stoic", "historian"],
  );

  const subagentReply = await historian.sendToSubagent(
    "plato-reader",
    "Give me a Platonic argument for truth.",
  );

  assert.match(subagentReply ?? "", /Platonic|Platonic|Plato|soul/i);

  const agentReply = await moderator.sendToAgent(
    "stoic",
    "Give me the shortest possible case for truth over comfort.",
  );

  assert.match(agentReply ?? "", /Truth matters more than comfort/i);
  assert.deepEqual(
    stoic.getChat().slice(-2).map((message) => ({
      sender: message.sender,
      target: message.target,
      scope: message.scope,
    })),
    [
      {
        sender: "moderator",
        target: "stoic",
        scope: "directed",
      },
      {
        sender: "stoic",
        target: "moderator",
        scope: "directed",
      },
    ],
  );

  const noteReply = await troupe.sendTo(
    "noter",
    "Record the strongest argument from the discussion.",
  );

  assert.equal(noteReply?.sender, "noter");
  assert.equal(moderator.longTermMemory, undefined);
  assert.equal(stoic.longTermMemory, undefined);
  assert.equal(historian.longTermMemory, undefined);
  assert.deepEqual(notesMemory.load("noter"), {
    lastNote: "Stored a note about the debate.",
  });
});

test("steering tool results are summarized instead of stored as raw JSON in agent history", async () => {
  const provider = new SteeringToolProvider();
  const agent = new Agent({
    name: "coordinator",
    systemPrompt: "Coordinate the discussion.",
    modelConfig: { provider },
    tools: [
      new Tool({
        name: "conversation_steer",
        description: "Steer the conversation.",
        historyMode: "steering",
        historyFormatter: () => "Conversation update: quick answers received.",
        function: () => ({ ok: false, message: "Round limit reached." }),
      }),
    ],
  });

  const reply = await agent.respond("Start");

  assert.equal(reply, "done");
  assert.ok(
    provider.secondRequestMessages.some((message) =>
      message.content === "Conversation update: quick answers received."
    ),
  );
  assert.ok(
    provider.secondRequestMessages.every((message) =>
      !message.content.includes('"ok":false')
    ),
  );
  assert.ok(
    provider.secondRequestMessages.every((message) =>
      !message.content.includes("Tool response from conversation_steer")
    ),
  );
});

test("ending on the last allowed round without hitting the cap does not trigger a final answer prompt", async () => {
  const provider = new FinalAnswerProvider();
  const closer = new Agent({
    name: "closer",
    systemPrompt: "Close the discussion when needed.",
    modelConfig: { provider },
  });

  const troupe = new Troupe({
    name: "closing-circle",
    agents: [closer],
    conversation: {
      maxRounds: 1,
      maxParticipants: 1,
      maxNextRoundQuestions: 1,
      maxContextMessages: 10,
    },
  });

  const replies = await troupe.send("Open the discussion.");

  assert.deepEqual(
    replies.map((reply) => reply.content),
    ["Initial discussion note."],
  );
  assert.equal(
    provider.prompts.some((prompt) =>
      prompt.includes("The max amount of rounds is finished.")
    ),
    false,
  );
});

test("hitting the troupe round cap triggers one final answer prompt", async () => {
  const provider = new RoundLimitToolProvider();
  const closer = new Agent({
    name: "closer",
    systemPrompt: "Close the discussion when needed.",
    modelConfig: { provider },
  });

  const troupe = new Troupe({
    name: "closing-circle",
    agents: [closer],
    conversation: {
      maxRounds: 1,
      maxParticipants: 1,
      maxNextRoundQuestions: 1,
      maxContextMessages: 10,
    },
  });

  const replies = await troupe.send("Open the discussion.");

  assert.deepEqual(
    replies.map((reply) => reply.content),
    [
      "Initial discussion note.",
      "Final answer: summarize the conversation and conclude.",
    ],
  );
  assert.ok(
    provider.prompts.some((prompt) =>
      prompt.includes("The max amount of rounds is finished.")
    ),
  );
});
