import test from "node:test";
import assert from "node:assert/strict";
import { config as loadEnv } from "dotenv";

import {
  Agent,
  GeminiProvider,
  StoredMemory,
  Troupe,
} from "../src/index.ts";

test("full integration with Gemini provider", async (context) => {
  loadEnv();

  const enabled = process.env.RUN_FULL_INTEGRATION_TESTS === "1";
  const apiKey = process.env.GEMINI_API_KEY;

  if (!enabled || !apiKey) {
    context.skip(
      "Set RUN_FULL_INTEGRATION_TESTS=1 and GEMINI_API_KEY in .env to run this test.",
    );
    return;
  }

  const provider = new GeminiProvider({
    model: process.env.GEMINI_MODEL ?? "gemini-3-flash-preview",
    apiKey,
    baseUrl: process.env.GEMINI_BASE_URL,
    temperature: 0.2,
  });

  const notesMemory = new StoredMemory("./.tmp-full-integration-notes.json");

  const moderator = new Agent({
    name: "moderator",
    systemPrompt:
      "Moderate briefly. Keep the discussion focused on the tradeoff between happiness and truth.",
    modelConfig: { provider },
  });

  const noter = new Agent({
    name: "noter",
    systemPrompt:
      "Write one concise note capturing the strongest claim you hear.",
    modelConfig: { provider },
    longTermMemory: notesMemory,
    memoryPrefix: "noter",
    callbacks: {
      async onUpdate({ agent, newMessage }) {
        if (newMessage.sender !== "noter") {
          return;
        }

        await agent.saveLongTermMemory({
          latestNote: newMessage.content,
        });
      },
    },
  });

  const stoic = new Agent({
    name: "stoic",
    systemPrompt:
      "Respond as a stoic philosopher. Be concise and serious.",
    modelConfig: { provider },
  });

  const historian = new Agent({
    name: "historian",
    systemPrompt:
      "Respond as a philosophical historian. Give brief context.",
    modelConfig: { provider },
  });

  historian.addSubAgent({
    name: "plato-reader",
    systemPrompt:
      "Give one short Platonic angle on why truth matters.",
    modelConfig: { provider },
  });

  const troupe = new Troupe({
    name: "full-integration-circle",
    agents: [moderator, noter, stoic, historian],
  });

  const troupeReplies = await troupe.send(
    "Is it better to be happy or to know the truth? Reply in at most two sentences.",
  );

  console.log("\n[Troupe Replies]");
  for (const reply of troupeReplies) {
    console.log(`${reply.sender}: ${reply.content}`);
  }

  assert.ok(troupeReplies.length >= 2);
  assert.ok(troupeReplies.every((reply) => reply.content.length > 0));

  const subagentReply = await historian.sendToSubagent(
    "plato-reader",
    "Give one short argument.",
  );

  console.log("\n[Subagent Reply]");
  console.log(subagentReply);

  assert.ok(subagentReply);
  assert.ok(subagentReply.length > 0);

  const noteReply = await troupe.sendTo(
    "noter",
    "Record the strongest single point from this discussion in one sentence.",
  );

  console.log("\n[Noter Reply]");
  console.log(noteReply?.content);

  assert.equal(noteReply?.sender, "noter");

  const saved = await notesMemory.load("noter");
  console.log("\n[Saved Note]");
  console.log(saved);
  assert.ok(saved);
});
