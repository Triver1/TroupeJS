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
  includeToolCallsInMessages?: boolean;
  supportsStructuredOutput?: boolean;
}

function validateSchema(value: unknown, schema: Record<string, unknown>): void {
  if (schema.enum && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(value)) {
      throw new ProviderError("Structured output failed enum validation.");
    }
  }

  const schemaType = schema.type;
  if (schemaType === "string" && typeof value !== "string") {
    throw new ProviderError("Structured output expected string.");
  }
  if (schemaType === "number" && typeof value !== "number") {
    throw new ProviderError("Structured output expected number.");
  }
  if (schemaType === "integer" && !Number.isInteger(value)) {
    throw new ProviderError("Structured output expected integer.");
  }
  if (schemaType === "boolean" && typeof value !== "boolean") {
    throw new ProviderError("Structured output expected boolean.");
  }
  if (schemaType === "object" && (typeof value !== "object" || value === null || Array.isArray(value))) {
    throw new ProviderError("Structured output expected object.");
  }
  if (schemaType === "array" && !Array.isArray(value)) {
    throw new ProviderError("Structured output expected array.");
  }

  if (schemaType === "array" && Array.isArray(value)) {
    const minItems = typeof schema.minItems === "number" ? schema.minItems : undefined;
    const maxItems = typeof schema.maxItems === "number" ? schema.maxItems : undefined;
    if (minItems !== undefined && value.length < minItems) {
      throw new ProviderError("Structured output array too short.");
    }
    if (maxItems !== undefined && value.length > maxItems) {
      throw new ProviderError("Structured output array too long.");
    }
    if (schema.items && typeof schema.items === "object") {
      for (const item of value) {
        validateSchema(item, schema.items as Record<string, unknown>);
      }
    }
  }

  if (schemaType === "object" && typeof value === "object" && value && !Array.isArray(value)) {
    const properties = schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, Record<string, unknown>>)
      : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!(key in (value as Record<string, unknown>))) {
        throw new ProviderError(`Structured output missing required key "${key}".`);
      }
    }

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in (value as Record<string, unknown>)) {
        validateSchema((value as Record<string, unknown>)[key], propertySchema);
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        if (!(key in properties)) {
          throw new ProviderError(`Structured output has unexpected key "${key}".`);
        }
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        if (!(key in properties)) {
          validateSchema(
            (value as Record<string, unknown>)[key],
            schema.additionalProperties as Record<string, unknown>,
          );
        }
      }
    }
  }
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
    tool_call_id?: string;
    tool_calls?: Array<{
      id?: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
    name?: string;
  }> {
    return [
      request.systemPrompt
        ? { role: "system", content: request.systemPrompt }
        : null,
      ...request.messages.map((message) => ({
        role: message.role === "agent" ? "assistant" : message.role,
        content: message.content,
        tool_call_id: message.toolCallId,
        name: message.role === "tool" ? message.sender : undefined,
        tool_calls: this.config.includeToolCallsInMessages === false
          ? undefined
          : message.toolCalls?.map((toolCall) => ({
            id: toolCall.id,
            type: "function",
            function: {
              name: toolCall.toolName,
              arguments: JSON.stringify(toolCall.input ?? {}),
            },
          })),
      })),
      request.input ? { role: "user", content: request.input } : null,
    ].filter((value): value is { role: string; content: string } => value !== null);
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const responseFormat = request.responseSchema && this.config.supportsStructuredOutput !== false
      ? {
        type: "json_schema",
        json_schema: {
          name: request.responseSchema.name,
          schema: request.responseSchema.schema,
          strict: request.responseSchema.strict ?? true,
        },
      }
      : undefined;
    const tools = request.tools.length > 0
      ? request.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters ?? {
            type: "object",
            additionalProperties: true,
          },
        },
      }))
      : undefined;
    const response = await fetch(
      `${this.config.baseUrl}${this.config.path ?? "/chat/completions"}`,
      {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          temperature: this.config.temperature ?? 0,
          messages: this.buildMessages(request),
          tools,
          response_format: responseFormat,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderError(
        `${this.constructor.name} request failed with status ${response.status}: ${errorText}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };
    const message = payload.choices?.[0]?.message;
    const toolCalls = message?.tool_calls?.map((toolCall) => {
      const rawArgs = toolCall.function?.arguments ?? "";
      let input: unknown = rawArgs;
      if (rawArgs) {
        try {
          input = JSON.parse(rawArgs);
        } catch {
          input = rawArgs;
        }
      }

      return {
        id: toolCall.id,
        toolName: toolCall.function?.name ?? "",
        input,
      };
    }).filter((toolCall) => toolCall.toolName);

    let parsed: unknown = undefined;
    if (request.responseSchema && this.config.supportsStructuredOutput !== false) {
      const raw = message?.content ?? "";
      try {
        parsed = raw ? JSON.parse(raw) : null;
        validateSchema(parsed, request.responseSchema.schema);
      } catch (error) {
        throw new ProviderError(
          `Structured output validation failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }

    return {
      content: message?.content ?? "",
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      parsed,
    };
  }
}
