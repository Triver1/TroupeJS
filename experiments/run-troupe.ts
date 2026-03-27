import {
  Agent,
  DeepSeekProvider,
  GeminiProvider,
  Troupe,
} from "../packages/troupejs/src/index.ts";

const providerName = process.env.EXPERIMENT_PROVIDER ?? "gemini";
const geminiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_BASE_MODEL ?? "gemini-3-flash-preview";
const geminiBaseUrl = process.env.GEMINI_BASE_URL;
const deepseekKey = process.env.DEEPSEEK_API_KEY;
const deepseekModel = process.env.DEEPSEEK_BASE_MODEL ?? "deepseek-chat";
const deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

if (providerName === "deepseek" && !deepseekKey) {
  console.error("Missing DEEPSEEK_API_KEY in environment.");
  process.exit(1);
}

if (providerName !== "deepseek" && !geminiKey) {
  console.error("Missing GEMINI_API_KEY in environment.");
  process.exit(1);
}

const MAX_RETRIES = Number(process.env.EXPERIMENT_RETRIES ?? "2");
const RETRY_DELAY_MS = Number(process.env.EXPERIMENT_RETRY_DELAY_MS ?? "1500");
const DEBUG = process.env.EXPERIMENT_DEBUG === "1";

const customerEmail =
  'Hi support, we merged two hospital departments into one workspace over the weekend and enabled SSO enforcement plus SCIM provisioning this morning. Now some clinicians can sign in, 23 cannot, a few are landing in the wrong department, and the audit log shows repeated deprovision/reprovision events. The billing page says our Enterprise renewal is unpaid, but finance has a wire confirmation from five days ago. We also have a HIPAA audit tomorrow and shift handoff starts in 35 minutes. Please tell us exactly what is happening, what is safe to do right now, and what information you need from us.';

function createProvider(temperature: number) {
  if (providerName === "deepseek") {
    return new DeepSeekProvider({
      apiKey: deepseekKey ?? "",
      model: deepseekModel,
      baseUrl: deepseekBaseUrl,
      temperature,
    });
  }

  return new GeminiProvider({
    apiKey: geminiKey ?? "",
    model: geminiModel,
    baseUrl: geminiBaseUrl || undefined,
    temperature,
  });
}

function createDebugCallbacks(name: string) {
  if (!DEBUG) {
    return undefined;
  }

  return {
    onUpdate({
      history,
      newMessage,
    }: {
      history: Array<{ content: string }>;
      newMessage: { content: string; metadata?: Record<string, unknown> };
    }) {
      const channel = newMessage.metadata?.channel === "outbound"
        ? " outbound"
        : "";
      const prompt = history.at(-2)?.content ?? "(no prompt)";
      console.log(`\n[debug:${name}${channel}]`);
      console.log(`${prompt} -> ${newMessage.content}`);
    },
  };
}

function createTroupe(): Troupe {
  const incidentCommander = new Agent({
    name: "incident-commander",
    systemPrompt: [
      "You run urgent enterprise SaaS incidents.",
      "On your first turn, gather specialist input before concluding.",
      "Use askGroup when the troupe needs another pass on a focused question.",
      "After specialist answers exist, summarize the most likely failure domains and next checks.",
      "Reply only as internal notes in exactly 3 bullets.",
      "Do not write customer-facing prose.",
    ].join(" "),
    modelConfig: { provider: createProvider(0.2) },
    callbacks: createDebugCallbacks("incident-commander"),
  });

  const billingOps = new Agent({
    name: "billing-ops",
    systemPrompt: [
      "You are a billing operations specialist for an enterprise SaaS platform.",
      "Analyze invoices, subscriptions, entitlements, renewal mapping, and plan-sync failures.",
      "Reply only with billing or entitlement analysis in exactly 3 bullets.",
      "Do not comment on SSO configuration beyond plan-related effects.",
      "Do not write customer-facing prose.",
    ].join(" "),
    modelConfig: { provider: createProvider(0.1) },
    callbacks: createDebugCallbacks("billing-ops"),
  });

  const accessEngineer = new Agent({
    name: "access-engineer",
    systemPrompt: [
      "You are an access and identity engineer.",
      "Analyze SSO enforcement, IdP configuration, session invalidation, and safe access restoration steps.",
      "Recommend only actions that preserve identity controls.",
      "Reply only as internal notes in exactly 3 bullets.",
      "Do not write customer-facing prose.",
    ].join(" "),
    modelConfig: { provider: createProvider(0.1) },
    callbacks: createDebugCallbacks("access-engineer"),
  });

  const riskPolicy = new Agent({
    name: "risk-policy",
    systemPrompt: [
      "You are a support policy and risk reviewer.",
      "Flag unsafe promises, missing verification steps, and actions that could weaken access controls.",
      "If another agent proposes disabling or bypassing access controls, evaluate that risk directly.",
      "Reply only as internal notes in exactly 3 bullets.",
      "Do not write customer-facing prose.",
    ].join(" "),
    modelConfig: { provider: createProvider(0.1) },
    callbacks: createDebugCallbacks("risk-policy"),
  });

  const customerComms = new Agent({
    name: "customer-comms",
    systemPrompt: [
      "You write customer-facing enterprise support replies.",
      "If billing-ops, access-engineer, and risk-policy notes are not already present in the troupe conversation, do not reply yet.",
      "Respond directly to the customer with one short paragraph and, if needed, a short list of next steps.",
      "Acknowledge urgency, avoid invented facts, ask only for the minimum information needed to identify the workspace and verify the admin, and mention that billing and access are being checked in parallel.",
      "Do not mention internal teams by role name.",
    ].join(" "),
    modelConfig: { provider: createProvider(0.3) },
    callbacks: createDebugCallbacks("customer-comms"),
  });

  return new Troupe({
    name: "clinic-access-war-room",
    conversation: {
      routerName: "incident-commander",
      maxRounds: 10,
      maxParticipants: 4,
      maxNextRoundQuestions: 4,
      maxContextMessages: 12,
    },
    agents: [
      incidentCommander,
      billingOps,
      accessEngineer,
      riskPolicy,
      customerComms,
    ],
  });
}

function printTranscript(troupe: Troupe) {
  for (const message of troupe.getMessages()) {
    if (message.role === "tool") {
      continue;
    }
    const speaker = message.sender ?? message.role;
    console.log(`${speaker}: ${message.content}`);
  }
}

async function runScenario(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    console.log(`\n=== Scenario: clinic-sso-entitlement-incident (attempt ${attempt}/${MAX_RETRIES}) ===`);

    try {
      const troupe = createTroupe();
      const replies = await troupe.send(customerEmail);

      console.log("\n[Transcript]");
      printTranscript(troupe);

      const finalReply = replies.find((reply) => reply.sender === "customer-comms");
      console.log("\n[Customer Comms Reply]");
      console.log(finalReply?.content ?? "(no reply)");
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      if (attempt === MAX_RETRIES) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

await runScenario();

