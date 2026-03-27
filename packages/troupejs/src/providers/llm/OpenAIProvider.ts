import {
  OpenAICompatibleProvider,
  type OpenAICompatibleProviderConfig,
} from "./OpenAICompatibleProvider.ts";

export interface OpenAIProviderConfig
  extends Omit<OpenAICompatibleProviderConfig, "baseUrl"> {
  baseUrl?: string;
}

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(config: OpenAIProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl ?? "https://api.openai.com/v1",
    });
  }
}

