import { readFile, writeFile } from "node:fs/promises";
import type { MemoryStore } from "./MemoryStore.ts";

export class StoredMemory<T = unknown> implements MemoryStore<T> {
  readonly filename: string;

  constructor(filename: string) {
    this.filename = filename;
  }

  async load(prefix: string): Promise<T | null> {
    const data = await this.#readAll();
    return (data[prefix] as T | undefined) ?? null;
  }

  async save(prefix: string, value: T): Promise<void> {
    const data = await this.#readAll();
    data[prefix] = value;
    await writeFile(this.filename, JSON.stringify(data, null, 2), "utf8");
  }

  async #readAll(): Promise<Record<string, unknown>> {
    try {
      const raw = await readFile(this.filename, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return parsed;
    } catch (error) {
      const readError = error as NodeJS.ErrnoException;
      if (readError.code === "ENOENT") {
        return {};
      }

      throw error;
    }
  }
}
