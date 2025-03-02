import { describe, it, expect } from "vitest";
import { chunkArray } from "../chunk-array";

describe("chunkArray", () => {
  it("should chunk array into equal parts", () => {
    const array = [1, 2, 3, 4, 5, 6];
    const chunks = [...chunkArray(array, 2)];
    expect(chunks).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it("should handle empty arrays", () => {
    const array: number[] = [];
    const chunks = [...chunkArray(array, 2)];
    expect(chunks).toEqual([]);
  });

  it("should handle arrays smaller than chunk size", () => {
    const array = [1, 2];
    const chunks = [...chunkArray(array, 3)];
    expect(chunks).toEqual([[1, 2]]);
  });

  it("should handle uneven chunks", () => {
    const array = [1, 2, 3, 4, 5];
    const chunks = [...chunkArray(array, 2)];
    expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("should handle chunk size of 1", () => {
    const array = [1, 2, 3];
    const chunks = [...chunkArray(array, 1)];
    expect(chunks).toEqual([[1], [2], [3]]);
  });

  it("should handle different types", () => {
    const array = ["a", "b", "c", "d"];
    const chunks = [...chunkArray(array, 2)];
    expect(chunks).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("should throw error for invalid chunk size", () => {
    const array = [1, 2, 3];
    expect(() => [...chunkArray(array, 0)]).toThrow();
    expect(() => [...chunkArray(array, -1)]).toThrow();
  });
});
