import {
  OpenAICompatibleProvider,
  type OpenAICompatibleProviderConfig,
} from "./OpenAICompatibleProvider.ts";

export interface DeepSeekProviderConfig
  extends Omit<OpenAICompatibleProviderConfig, "baseUrl"> {
  baseUrl?: string;
}

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(config: DeepSeekProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl ?? "https://api.deepseek.com",
      supportsStructuredOutput: false,
    });
  }
}
