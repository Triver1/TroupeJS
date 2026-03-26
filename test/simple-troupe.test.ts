import test from "node:test";
import assert from "node:assert/strict";

import {
  Agent,
  BaseProvider,
  Troupe,
} from "../src/index.ts";
import type { MemoryStore } from "../src/index.ts";

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
