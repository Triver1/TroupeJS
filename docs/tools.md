# Tools

Tools are typed functions that agents can call.

## `new Tool()`

Required fields:

- `name`
- `description`
- `inputSchema`
- `function`

Optional fields:

- `outputSchema`

`inputSchema` is required. `outputSchema` is optional.

## Example

```ts
import { z } from "zod";

const summarize = new Tool({
  name: "summarize",
  description: "Summarize a long text",
  inputSchema: z.object({
    text: z.string(),
  }),
  outputSchema: z.object({
    summary: z.string(),
  }),
  async function({ text }) {
    return { summary: text.slice(0, 120) };
  },
});
```

## Design Rules

- Tool inputs are validated through `inputSchema`.
- Tool outputs use `outputSchema` when strict output checking is useful.
- Tools stay small and focused.
- Tools describe one clear capability.

