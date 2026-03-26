import { ProviderError } from "../../lib/errors.ts";
import {
  BaseProvider,
  type ProviderRequest,
  type ProviderResponse,
} from "./BaseProvider.ts";

export interface ClaudeProviderConfig {
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export class ClaudeProvider extends BaseProvider {
  readonly config: ClaudeProviderConfig;

  constructor(config: ClaudeProviderConfig) {
    super();
    this.config = config;
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const response = await fetch(
      `${this.config.baseUrl ?? "https://api.anthropic.com"}/v1/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: this.config.temperature ?? 0,
          max_tokens: this.config.maxTokens ?? 512,
          system: request.systemPrompt,
          messages: [
            ...request.messages.map((message) => ({
              role: message.role === "agent" ? "assistant" : "user",
              content: message.content,
            })),
            { role: "user", content: request.input },
          ],
        }),
      },
    );

    if (!response.ok) {
      throw new ProviderError(
        `ClaudeProvider request failed with status ${response.status}`,
      );
    }

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };

    const text = payload.content
      ?.filter((item) => item.type === "text" && item.text)
      .map((item) => item.text)
      .join("\n") ?? "";

    return { content: text };
  }
}
