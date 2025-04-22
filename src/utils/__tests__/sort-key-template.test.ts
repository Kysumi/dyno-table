import { describe, it, expect } from "vitest";
import { sortKey } from "../sort-key-template";

describe("sortKey template function", () => {
  it("should generate a complete sort key with all parameters", () => {
    const sk = sortKey`country#${"country"}#enclosure#${"enclosure"}#diet#${"diet"}`;
    const result = sk({ country: "NZ", enclosure: "A1", diet: "carnivore" });
    expect(result).toBe("country#NZ#enclosure#A1#diet#carnivore");
  });

  it("should generate a partial sort key with some parameters", () => {
    const sk = sortKey`country#${"country"}#enclosure#${"enclosure"}#diet#${"diet"}`;
    const result = sk({ country: "NZ", enclosure: "A1" });
    expect(result).toBe("country#NZ#enclosure#A1#diet#");
  });

  it("should handle minimum required parameters", () => {
    const sk = sortKey`country#${"country"}#enclosure#${"enclosure"}`;
    const result = sk({ country: "NZ" });
    expect(result).toBe("country#NZ#enclosure#");
  });

  it("should handle single parameter template", () => {
    const sk = sortKey`country#${"country"}`;
    const result = sk({ country: "NZ" });
    expect(result).toBe("country#NZ");
  });

  it("should handle complex template with multiple parameters", () => {
    const sk = sortKey`type#${"type"}#id#${"id"}#status#${"status"}#version#${"version"}`;
    const result = sk({ type: "user", id: "123", status: "active", version: "1" });
    expect(result).toBe("type#user#id#123#status#active#version#1");
  });

  it("should handle partial complex template", () => {
    const sk = sortKey`type#${"type"}#id#${"id"}#status#${"status"}#version#${"version"}`;
    const result = sk({ type: "user", id: "123" });

    // It should only create the sortKey up until the first undefined parameter
    expect(result).toBe("type#user#id#123#status#");
  });

  it("should handle empty string values", () => {
    const sk = sortKey`country#${"country"}#enclosure#${"enclosure"}`;
    const result = sk({ country: "", enclosure: "" });
    expect(result).toBe("country##enclosure#");
  });

  it("should handle special characters in values", () => {
    const sk = sortKey`country#${"country"}#enclosure#${"enclosure"}`;
    const result = sk({ country: "NZ#123", enclosure: "A1@test" });
    expect(result).toBe("country#NZ#123#enclosure#A1@test");
  });
});
