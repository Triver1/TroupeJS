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

const scenarioPrompt =
  'Captain, enemy sails off the starboard bow. A fast brig is closing with us just before dusk. The wind favors them, our powder room took spray an hour ago, and the crew is split: some want to run for the shoals, others want to swing wide and board. We have one chance to act before they enter clean cannon range. What do we do?';

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
  const captain = new Agent({
    name: "captain",
    systemPrompt: [
      "You are the captain of a pirate crew facing a live naval threat.",
      "Think like a decisive but practical commander.",
      "On your first turn, give a provisional read and name the exact uncertainty you want the crew to resolve.",
      "Once enough input exists, give a concrete plan in a captain's voice.",
      "Keep replies short, vivid, and specific.",
    ].join(" "),
    modelConfig: { provider: createProvider(0.2) },
    callbacks: createDebugCallbacks("captain"),
  });

  const cannoneer = new Agent({
    name: "cannoneer",
    systemPrompt: [
      "You are the ship's cannoneer.",
      "Judge range, firing angles, powder quality, reload speed, hull damage, and whether the guns can decide the fight.",
      "Speak plainly about what the cannons can and cannot do right now.",
      "Keep replies short and concrete.",
    ].join(" "),
    modelConfig: { provider: createProvider(0.1) },
    callbacks: createDebugCallbacks("cannoneer"),
  });

  const pirate = new Agent({
    name: "pirate",
    systemPrompt: [
      "You are a seasoned pirate and boarding fighter.",
      "Judge morale, boarding chances, sail handling, close-quarters risk, and what the enemy crew is likely to do.",
      "Push for bold action when it is real, but do not pretend the odds are better than they are.",
      "Keep replies short and concrete.",
    ].join(" "),
    modelConfig: { provider: createProvider(0.1) },
    callbacks: createDebugCallbacks("pirate"),
  });

  const navigator = new Agent({
    name: "navigator",
    systemPrompt: [
      "You are the ship's navigator and sailing master.",
      "Judge wind, currents, shoals, turning room, dusk visibility, and whether escape or positioning is possible.",
      "Keep replies short and concrete.",
    ].join(" "),
    modelConfig: { provider: createProvider(0.1) },
    callbacks: createDebugCallbacks("navigator"),
  });

  const quartermaster = new Agent({
    name: "quartermaster",
    systemPrompt: [
      "You are the quartermaster.",
      "Judge crew readiness, supplies, damage tolerance, discipline, and whether the ship can survive a drawn-out fight.",
      "Keep replies short and concrete.",
    ].join(" "),
    modelConfig: { provider: createProvider(0.3) },
    callbacks: createDebugCallbacks("quartermaster"),
  });

  return new Troupe({
    name: "blackwake-council",
    conversation: {
      routerName: "captain",
      maxRounds: 10,
      maxParticipants: 4,
      maxContextMessages: 12,
    },
    agents: [
      captain,
      cannoneer,
      pirate,
      navigator,
      quartermaster,
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
    console.log(`\n=== Scenario: pirate-crew-enemy-sighting (attempt ${attempt}/${MAX_RETRIES}) ===`);

    try {
      const troupe = createTroupe();
      const replies = await troupe.send(scenarioPrompt);

      console.log("\n[Transcript]");
      printTranscript(troupe);

      const captainReply = [...replies].reverse().find((reply) => reply.sender === "captain");
      console.log("\n[Captain Reply]");
      console.log(captainReply?.content ?? "(no reply)");
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

