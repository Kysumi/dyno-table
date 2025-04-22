export type StrictGenerateType<T extends readonly string[]> = {
  [K in T[number]]: string;
};

/**
 * Creates a template function for generating DynamoDB partition keys with dynamic values.
 * Use this function when you need to:
 * - Create consistent partition key patterns with variable parts
 * - Generate partition keys that follow a specific format
 * - Ensure type safety for partition key parameters
 * - Require all parameters to be provided
 *
 * @example
 * ```ts
 * // Define a partition key template
 * const pk = partitionKey`country#${"country"}#enclosure#${"enclosure"}`;
 *
 * // Generate a partition key (all parameters required)
 * const key = pk({ country: "NZ", enclosure: "A1" });
 * // Result: "country#NZ#enclosure#A1"
 *
 * // Type checking ensures all parameters are provided
 * const invalidKey = pk({ country: "NZ" }); // TypeScript error
 * ```
 *
 * @param strings - The static parts of the template string
 * @param keys - The dynamic parts of the template string that will be replaced with values
 *
 * @returns A function that accepts an object with the dynamic values and returns the formatted partition key
 */
export function partitionKey<T extends readonly string[]>(
  strings: TemplateStringsArray,
  ...keys: T
): (params: StrictGenerateType<T>) => string {
  return (params) => {
    let result = strings[0] ?? "";

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key) {
        result += params[key as T[number]] + (strings[i + 1] ?? "");
      }
    }

    return result;
  };
}
