export interface MemoryStore<T = unknown> {
  load(prefix: string): Promise<T | null> | T | null;
  save(prefix: string, value: T): Promise<void> | void;
}
