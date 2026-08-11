import { describe, expect, it, vi } from "vitest";
import { ErrorCodes, ValidationError } from "../../errors";
import type { StandardSchemaV1 } from "../../standard-schema";
import type { DynamoItem } from "../../types";
import { createIndex } from "../create-index";

interface KeyInput extends DynamoItem {
  id: string;
  category?: string;
}

function createSchema(validate: (value: unknown) => StandardSchemaV1.Result<KeyInput>): StandardSchemaV1<KeyInput> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate,
    },
  };
}

describe("createIndex", () => {
  it("builds a composite index and generates both keys", () => {
    const input = { id: "123", category: "fossil" };
    const validate = vi.fn(() => ({ value: input }));
    const partitionKey = vi.fn((item: KeyInput) => `ITEM#${item.id}`);
    const sortKey = vi.fn((item: KeyInput) => `CATEGORY#${item.category}`);

    const index = createIndex().input(createSchema(validate)).partitionKey(partitionKey).sortKey(sortKey);

    expect(index).toMatchObject({
      name: "custom",
      partitionKey: "pk",
      sortKey: "sk",
      isReadOnly: false,
    });
    expect(index.generateKey(input)).toEqual({ pk: "ITEM#123", sk: "CATEGORY#fossil" });
    expect(validate).toHaveBeenCalledOnce();
    expect(validate).toHaveBeenCalledWith(input);
    expect(partitionKey).toHaveBeenCalledWith(input);
    expect(sortKey).toHaveBeenCalledWith(input);
  });

  it("builds a partition-only index without a sort key", () => {
    const input = { id: "123" };
    const partitionKey = vi.fn((item: KeyInput) => `ITEM#${item.id}`);
    const index = createIndex()
      .input(createSchema(() => ({ value: input })))
      .partitionKey(partitionKey)
      .withoutSortKey();

    expect(index).toMatchObject({ name: "custom", partitionKey: "pk", isReadOnly: false });
    expect(index).not.toHaveProperty("sortKey");
    expect(index.generateKey(input)).toEqual({ pk: "ITEM#123" });
    expect(partitionKey).toHaveBeenCalledWith(input);
  });

  it("uses schema-normalized data to generate keys", () => {
    const input = { id: " 123 " };
    const normalized = { id: "123", category: "unknown" };
    const partitionKey = vi.fn((item: KeyInput) => `ITEM#${item.id}`);
    const sortKey = vi.fn((item: KeyInput) => `CATEGORY#${item.category}`);
    const index = createIndex()
      .input(createSchema(() => ({ value: normalized })))
      .partitionKey(partitionKey)
      .sortKey(sortKey);

    expect(index.generateKey(input)).toEqual({ pk: "ITEM#123", sk: "CATEGORY#unknown" });
    expect(partitionKey).toHaveBeenCalledWith(normalized);
    expect(sortKey).toHaveBeenCalledWith(normalized);
  });

  it("supports read-only configuration before building the index", () => {
    const schema = createSchema((value) => ({ value: value as KeyInput }));

    const defaultReadOnly = createIndex()
      .input(schema)
      .readOnly()
      .partitionKey(({ id }) => id)
      .sortKey(({ category }) => category ?? "none");
    const explicitWritable = createIndex()
      .input(schema)
      .readOnly(false)
      .partitionKey(({ id }) => id)
      .withoutSortKey();

    expect(defaultReadOnly.isReadOnly).toBe(true);
    expect(explicitWritable.isReadOnly).toBe(false);
  });

  it("preserves post-build read-only defaults and does not mutate the original index", () => {
    const schema = createSchema((value) => ({ value: value as KeyInput }));
    const composite = createIndex()
      .input(schema)
      .partitionKey(({ id }) => id)
      .sortKey(({ category }) => category ?? "none");
    const partitionOnly = createIndex()
      .input(schema)
      .partitionKey(({ id }) => id)
      .withoutSortKey();

    expect(composite.readOnly().isReadOnly).toBe(false);
    expect(partitionOnly.readOnly().isReadOnly).toBe(true);
    expect(composite.readOnly(true).isReadOnly).toBe(true);
    expect(partitionOnly.readOnly(false).isReadOnly).toBe(false);
    expect(composite.isReadOnly).toBe(false);
    expect(partitionOnly.isReadOnly).toBe(false);
  });

  it("reports composite-index schema failures without generating keys", () => {
    const issues = [{ message: "id is required", path: ["id"] }];
    const partitionKey = vi.fn((item: KeyInput) => item.id);
    const sortKey = vi.fn((item: KeyInput) => item.category ?? "none");
    const index = createIndex()
      .input(createSchema(() => ({ issues })))
      .partitionKey(partitionKey)
      .sortKey(sortKey);

    let thrown: unknown;
    try {
      index.generateKey({ id: "" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ValidationError);
    expect(thrown).toMatchObject({
      code: ErrorCodes.SCHEMA_VALIDATION_FAILED,
      context: { keyType: "both", validationIssues: issues },
    });
    expect(partitionKey).not.toHaveBeenCalled();
    expect(sortKey).not.toHaveBeenCalled();
  });

  it("identifies partition-only schema failures", () => {
    const issues = [{ message: "id must not be empty" }];
    const index = createIndex()
      .input(createSchema(() => ({ issues })))
      .partitionKey(({ id }) => id)
      .withoutSortKey();

    let thrown: unknown;
    try {
      index.generateKey({ id: "" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ValidationError);
    expect(thrown).toMatchObject({
      code: ErrorCodes.SCHEMA_VALIDATION_FAILED,
      context: { keyType: "partition", validationIssues: issues },
    });
  });

  it("propagates errors thrown by the schema", () => {
    const schemaError = new Error("schema unavailable");
    const index = createIndex()
      .input(
        createSchema(() => {
          throw schemaError;
        }),
      )
      .partitionKey(({ id }) => id)
      .withoutSortKey();

    expect(() => index.generateKey({ id: "123" })).toThrow(schemaError);
  });

  it("does not generate a sort key when partition-key generation fails", () => {
    const partitionError = new Error("partition key failed");
    const sortKey = vi.fn((item: KeyInput) => item.category ?? "none");
    const index = createIndex()
      .input(createSchema((value) => ({ value: value as KeyInput })))
      .partitionKey(() => {
        throw partitionError;
      })
      .sortKey(sortKey);

    expect(() => index.generateKey({ id: "123" })).toThrow(partitionError);
    expect(sortKey).not.toHaveBeenCalled();
  });
});
