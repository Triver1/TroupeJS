# Memory

Memory objects are passed into agents.

TroupeJS does not hardcode one memory implementation. Agents can receive pluggable memory objects.

## Built-In Memory Objects

- `new RuntimeMemory()`
  Stores memory for the duration of the current execution only.

- `new StoredMemory(filename)`
  JSON-backed storage that loads from and saves to a file.

## Example

```ts
const agent = new Agent({
  name: "assistant",
  longTermMemory: new StoredMemory("./assistant.json"),
  memoryPrefix: "assistant",
  modelConfig,
});
```

If `shortTermMemory` is omitted, the agent uses `new RuntimeMemory()`.

If `longTermMemory` is omitted, the agent does not use persistent memory.

## Custom Memory

Users can bring their own persistence implementation without a large adapter system.

Interface:

```ts
interface MemoryStore<T = unknown> {
  load(prefix: string): Promise<T | null> | T | null;
  save(prefix: string, value: T): Promise<void> | void;
}
```

This is intentionally small. The framework only needs a way to load stored state and save updated state under a prefix.

The prefix namespaces memory data. This lets subagents store data inside the same parent-backed memory store without colliding with each other.

Examples of suitable backends:

- a JSON file
- SQLite
- a local SQL database
- a remote database table

Memory on top of SQL fits naturally into the framework.

