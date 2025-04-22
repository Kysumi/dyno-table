import type { KeyTemplate } from "./types";

type TemplateVariables<T extends string> = T extends `${infer _}\${${infer Var}}${infer Rest}`
  ? Var | TemplateVariables<Rest>
  : never;

type TemplateData<T extends string> = {
  [K in TemplateVariables<T>]: string;
};

export function partitionKey<T extends string>(
  strings: TemplateStringsArray,
  ...values: string[]
): (data: TemplateData<T>) => string {
  const template = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "");
  const variables = Array.from(new Set(template.match(/\${([^}]+)}/g)?.map((v) => v.slice(2, -1)) ?? []));

  return (data: TemplateData<T>) => {
    return variables.reduce((acc, variable) => {
      const value = data[variable as keyof TemplateData<T>];
      if (value === undefined) {
        throw new Error(`Missing required value for key variable: ${variable}`);
      }
      return acc.replace(`\${${variable}}`, value);
    }, template);
  };
}

export function sortKey<T extends string>(
  strings: TemplateStringsArray,
  ...values: string[]
): (data: TemplateData<T>) => string {
  const template = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "");
  const variables = Array.from(new Set(template.match(/\${([^}]+)}/g)?.map((v) => v.slice(2, -1)) ?? []));

  return (data: TemplateData<T>) => {
    return variables.reduce((acc, variable) => {
      const value = data[variable as keyof TemplateData<T>];
      if (value === undefined) {
        throw new Error(`Missing required value for key variable: ${variable}`);
      }
      return acc.replace(`\${${variable}}`, value);
    }, template);
  };
}
