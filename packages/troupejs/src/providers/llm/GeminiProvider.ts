import {
  OpenAICompatibleProvider,
  type OpenAICompatibleProviderConfig,
} from "./OpenAICompatibleProvider.ts";

export interface GeminiProviderConfig
  extends Omit<OpenAICompatibleProviderConfig, "baseUrl"> {
  baseUrl?: string;
}

export class GeminiProvider extends OpenAICompatibleProvider {
  override supportsToolResponses(): boolean {
    return false;
  }

  constructor(config: GeminiProviderConfig) {
    super({
      ...config,
      baseUrl:
        config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta/openai",
      includeToolCallsInMessages: false,
    });
  }
}
