import { describe, expect, it } from "vitest";
import { OperationError } from "../../errors";
import { isConditionalCheckFailed } from "../error-utils";

describe("isConditionalCheckFailed", () => {
  it("matches a raw error whose name is ConditionalCheckFailedException", () => {
    const raw = Object.assign(new Error("failed"), { name: "ConditionalCheckFailedException" });
    expect(isConditionalCheckFailed(raw)).toBe(true);
  });

  it("matches a table-operation error wrapping the raw AWS exception as .cause", () => {
    const rawAwsError = Object.assign(new Error("The conditional request failed"), {
      name: "ConditionalCheckFailedException",
    });
    const wrapped = new OperationError("Put operation failed", "OPERATION_FAILED", {}, rawAwsError);

    expect(isConditionalCheckFailed(wrapped)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isConditionalCheckFailed(new Error("boom"))).toBe(false);
    expect(isConditionalCheckFailed(new OperationError("boom", "OPERATION_FAILED"))).toBe(false);
    expect(isConditionalCheckFailed(undefined)).toBe(false);
  });
});
