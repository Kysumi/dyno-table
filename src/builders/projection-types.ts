import type { DynamoItem } from "../types";
import type { Path, PathType } from "./types";

/**
 * Utility type to extract the value type from a nested object path.
 */
type SafePathType<T, K extends Path<T>> = PathType<T, K> extends infer U ? U : never;

/**
 * Creates a projected type with only the selected fields.
 * This preserves the nested structure for dot-notation paths.
 */
export type ProjectedResult<T extends DynamoItem, Selected extends Path<T>[]> = Selected extends readonly []
  ? T
  : {
      [K in Selected[number] as K extends `${infer Root}.${string}` ? Root : K]: K extends `${infer Root}.${infer Rest}`
        ? Root extends keyof T
          ? Rest extends Path<NonNullable<T[Root]>>
            ? ProjectedResult<NonNullable<T[Root]>, [Rest]>
            : never
          : never
        : K extends keyof T
          ? T[K]
          : never;
    };

/**
 * Type guard and projection utility for runtime projection of items.
 */
export function projectItem<T extends DynamoItem, S extends Path<T>[]>(
  item: T,
  selectedFields?: S,
): S extends readonly [] ? T : ProjectedResult<T, S> {
  if (!selectedFields || selectedFields.length === 0) {
    return item as any;
  }

  const projected: any = {};

  for (const field of selectedFields) {
    // Handle nested paths like 'user.profile.name'
    const value = getNestedValue(item, field);
    setNestedValue(projected, field, value);
  }

  return projected;
}

/**
 * Gets a nested value from an object using a dot-notation path.
 */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((current, key) => {
    return current?.[key];
  }, obj);
}

/**
 * Sets a nested value in an object using a dot-notation path.
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  const lastKey = keys.pop()!;

  const target = keys.reduce((current, key) => {
    if (!(key in current)) {
      current[key] = {};
    }
    return current[key];
  }, obj);

  target[lastKey] = value;
}
