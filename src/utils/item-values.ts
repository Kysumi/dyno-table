import type { DynamoItem } from "../types.js";

/** Copy only the modified path so builder setters never mutate caller-owned nested values. */
export function setItemValues<T extends DynamoItem>(item: T, valuesOrPath: Partial<T> | string, value?: unknown): T {
  if (typeof valuesOrPath !== "string") {
    let result = item;
    for (const [path, entry] of Object.entries(valuesOrPath)) result = setItemValues(result, path, entry);
    return result;
  }
  const [key, ...rest] = valuesOrPath.split(".");
  if (!key || rest.some((part) => !part)) throw new Error("Attribute paths must not contain empty segments");
  const current = Object.hasOwn(item, key) ? item[key] : undefined;
  const next = rest.length
    ? setItemValues(
        (current !== null && typeof current === "object"
          ? current
          : /^\d+$/.test(rest[0] ?? "")
            ? []
            : {}) as DynamoItem,
        rest.join("."),
        value,
      )
    : value;
  const result = Array.isArray(item) ? [...item] : { ...item };
  Object.defineProperty(result, key, { value: next, enumerable: true, writable: true, configurable: true });
  return result as T;
}
