import { ProviderError } from "../../lib/errors.ts";
import {
  BaseProvider,
  type ProviderRequest,
  type ProviderResponse,
} from "./BaseProvider.ts";

export interface OpenAICompatibleProviderConfig {
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature?: number;
  path?: string;
  headers?: Record<string, string>;
}

export abstract class OpenAICompatibleProvider extends BaseProvider {
  readonly config: OpenAICompatibleProviderConfig;

  constructor(config: OpenAICompatibleProviderConfig) {
    super();
    this.config = config;
  }

  protected buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
      ...(this.config.headers ?? {}),
    };
  }

  protected buildMessages(request: ProviderRequest): Array<{
    role: string;
    content: string;
  }> {
    return [
      request.systemPrompt
        ? { role: "system", content: request.systemPrompt }
        : null,
      ...request.messages.map((message) => ({
        role: message.role === "agent" ? "assistant" : message.role,
        content: message.content,
      })),
      { role: "user", content: request.input },
    ].filter((value): value is { role: string; content: string } => value !== null);
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const response = await fetch(
      `${this.config.baseUrl}${this.config.path ?? "/chat/completions"}`,
      {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          temperature: this.config.temperature ?? 0,
          messages: this.buildMessages(request),
        }),
      },
    );

    if (!response.ok) {
      throw new ProviderError(
        `${this.constructor.name} request failed with status ${response.status}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    return {
      content: payload.choices?.[0]?.message?.content ?? "",
    };
  }
}
