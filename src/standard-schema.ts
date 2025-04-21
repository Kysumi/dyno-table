/** The Standard Schema interface. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  export interface Props<Input = unknown, Output = Input> {
    /** The version number of the standard. */
    readonly version: 1;
    /** The vendor name of the schema library. */
    readonly vendor: string;
    /** Validates unknown input values. */
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
    /** Inferred types associated with the schema. */
    readonly types?: Types<Input, Output> | undefined;
  }

  /** The result interface of the validate function. */
  export type Result<Output> = SuccessResult<Output> | FailureResult;

  /** The result interface if validation succeeds. */
  export interface SuccessResult<Output> {
    /** The typed output value. */
    readonly value: Output;
    /** The non-existent issues. */
    readonly issues?: undefined;
  }

  /** The result interface if validation fails. */
  export interface FailureResult {
    /** The non-existent value. */
    readonly value?: undefined;
    /** The validation issues. */
    readonly issues: readonly Issue[];
  }

  /** The validation issue interface. */
  export interface Issue {
    /** The validation message. */
    readonly message: string;
    /** The validation path. */
    readonly path?: readonly (string | number)[];
    /** The validation code. */
    readonly code?: string;
  }

  /** The types interface. */
  export interface Types<Input, Output> {
    /** The input type. */
    readonly input: Input;
    /** The output type. */
    readonly output: Output;
  }

  /** Infers the input type of a schema. */
  export type InferInput<T extends StandardSchemaV1> = T extends StandardSchemaV1<infer Input, unknown> ? Input : never;

  /** Infers the output type of a schema. */
  export type InferOutput<T extends StandardSchemaV1> = T extends StandardSchemaV1<unknown, infer Output>
    ? Output
    : never;
}
