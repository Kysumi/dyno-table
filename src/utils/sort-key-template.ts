export type GenerateType<T extends readonly string[], U extends string = never> = T extends [infer F, ...infer R]
  ? F extends string
    ? R extends string[]
      ? ({ [K in F | U]: unknown } & Partial<Record<Exclude<T[number], F | U>, never>>) | GenerateType<R, F | U>
      : never
    : never
  : never;

/**
 * Creates a template function for generating DynamoDB sort keys with dynamic values.
 * Use this function when you need to:
 * - Create consistent sort key patterns with variable parts
 * - Generate sort keys that follow a specific format
 * - Ensure type safety for sort key parameters
 *
 * @example
 * ```ts
 * // Define a sort key template
 * const sk = sortKey`country#${"country"}#enclosure#${"enclosure"}#diet#${"diet"}`;
 *
 * // Generate a sort key with partial parameters
 * const templatedString = sk({ country: "NZ", enclosure: "A1" });
 * // Result: "country#NZ#enclosure#A1#diet#"
 *
 * // Generate a complete sort key
 * const fullKey = sk({ country: "NZ", enclosure: "A1", diet: "carnivore" });
 * // Result: "country#NZ#enclosure#A1#diet#carnivore"
 *
 * // Type checking ensures only valid parameters are used
 * const invalidKey = sk({ country: "NZ", invalid: "value" }); // TypeScript error
 * ```
 *
 * @param strings - The static parts of the template string
 * @param keys - The dynamic parts of the template string that will be replaced with values
 *
 * @returns A function that accepts an object with the dynamic values and returns the formatted sort key
 */
export function sortKey<T extends readonly string[]>(
  strings: TemplateStringsArray,
  ...keys: T
): (params: GenerateType<T>) => string {
  return (params) => {
    let result = strings[0] ?? "";

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      if (key && params && key in params) {
        result += String(params[key]) + (strings[i + 1] ?? "");
      }
    }

    return result;
  };
}
