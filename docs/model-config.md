# Model Config

`modelConfig` defines how an agent connects to and uses an LLM provider.

TroupeJS keeps this provider-agnostic.

## Fields

- `provider`
- `model`
- `apiKey`
- `baseUrl` (optional)
- `retryPolicy`
- `temperature`
- other provider-specific options as needed

## Example

```ts
const modelConfig = {
  provider: "openai",
  model: "gpt-4.1",
  apiKey: process.env.OPENAI_API_KEY,
  retryPolicy: {
    maxRetries: 2,
    delayMs: 500,
  },
  temperature: 0.4,
};
```

## Notes

- `retryPolicy` groups retry behavior in one place.
- `baseUrl` allows self-hosted or compatible providers.
- Provider-specific fields are additive rather than changing the common shape.

