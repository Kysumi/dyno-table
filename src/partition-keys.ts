type Params<T extends readonly string[]> = {
  [K in T[number]]?: string;
};

function sortKey<T extends readonly string[]>(
    strings: TemplateStringsArray,
    ...keys: T
): (params: Params<T>) => string {
  return (params: Params<T>) => {
    // Runtime check to enforce continuous prefix constraint
    let previousKeyPresent = true;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key && key in params) {
        if (!previousKeyPresent) {
          throw new Error(
              `Missing previous key in continuous prefix: ${key}`
          );
        }
      } else {
        previousKeyPresent = false;
      }
    }

    // Type assertion to tell TypeScript that the parameters are valid
    const validParams = params as {
      [K in T[number]]?: string;
    };

    let result = strings[0] ?? "";
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key && validParams && validParams[key]) {
        result += validParams[key] + (strings[i + 1] ?? "");
      }
    }

    return result;
  };
}
