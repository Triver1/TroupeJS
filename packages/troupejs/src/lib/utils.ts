export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function hasFunction<T extends string>(
  value: unknown,
  key: T,
): value is Record<T, (...args: unknown[]) => unknown> {
  return isObject(value) && typeof value[key] === "function";
}
