import { describe, it, expect, beforeEach } from "vitest";
import { TransactionBuilder } from "../transaction-builder";
import type { DynamoTransactOperation } from "../../dynamo/dynamo-types";

describe("TransactionBuilder", () => {
  let builder: TransactionBuilder;

  beforeEach(() => {
    builder = new TransactionBuilder();
  });

  it("should initialize with an empty operations array", () => {
    const operation = builder.getOperation();
    expect(operation.operations).toHaveLength(0);
  });

  it("should add a put operation", () => {
    const putOperation: DynamoTransactOperation["operations"][0] = {
      put: {
        item: { pk: "USER#123", sk: "PROFILE#123", name: "John Doe" },
      },
    };

    builder.addOperation(putOperation);
    const operation = builder.getOperation();
    expect(operation.operations).toHaveLength(1);
    expect(operation.operations[0]).toEqual(putOperation);
  });

  it("should add a delete operation", () => {
    const deleteOperation: DynamoTransactOperation["operations"][0] = {
      delete: {
        key: { pk: "USER#123", sk: "PROFILE#123" },
      },
    };

    builder.addOperation(deleteOperation);
    const operation = builder.getOperation();
    expect(operation.operations).toHaveLength(1);
    expect(operation.operations[0]).toEqual(deleteOperation);
  });

  it("should add multiple operations", () => {
    const putOperation: DynamoTransactOperation["operations"][0] = {
      put: {
        item: { pk: "USER#123", sk: "PROFILE#123", name: "John Doe" },
      },
    };

    const deleteOperation: DynamoTransactOperation["operations"][0] = {
      delete: {
        key: { pk: "USER#124", sk: "PROFILE#124" },
      },
    };

    builder.addOperation(putOperation);
    builder.addOperation(deleteOperation);
    const operation = builder.getOperation();
    expect(operation.operations).toHaveLength(2);
    expect(operation.operations[0]).toEqual(putOperation);
    expect(operation.operations[1]).toEqual(deleteOperation);
  });

  it("Produces the correct output", () => {
    const staticData = {
      type: "transactWrite",
      operations: [
        {
          put: {
            item: {
              pk: "USER#123",
              sk: "PROFILE#123",
              name: "Hello Kitty",
              email: "hello-kitty@example.com",
              age: 30,
              type: "USER",
            },
          },
        },
        {
          put: {
            item: {
              pk: "USER#124",
              sk: "PROFILE#124",
              name: "Geoff Doe",
              email: "geoff@example.com",
              age: 30,
              type: "USER",
            },
          },
        },
      ],
    };

    builder.addOperation({
      put: {
        item: {
          pk: "USER#123",
          sk: "PROFILE#123",
          name: "Hello Kitty",
          email: "hello-kitty@example.com",
          age: 30,
          type: "USER",
        },
      },
    });
    builder.addOperation({
      put: {
        item: {
          pk: "USER#124",
          sk: "PROFILE#124",
          name: "Geoff Doe",
          email: "geoff@example.com",
          age: 30,
          type: "USER",
        },
      },
    });

    expect(builder.getOperation()).toEqual(staticData);
  });
});
