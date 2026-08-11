import { expect, it } from "vitest";
import { sortKey } from "../sort-key-template";

it("generates a sort key with or without parameters", () => {
  const sk = sortKey`investigationId#${"investigationId"}`;

  expect(sk()).toBe("investigationId#");
  expect(sk({ investigationId: "abc" })).toBe("investigationId#abc");
});
