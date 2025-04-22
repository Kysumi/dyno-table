import { describe, it, expect } from "vitest";
import { partitionKey } from "../partition-key-template";

describe("partitionKey template function", () => {
  it("should generate a complete partition key with all required parameters", () => {
    const pk = partitionKey`country#${"country"}#enclosure#${"enclosure"}`;
    const result = pk({ country: "NZ", enclosure: "A1" });
    expect(result).toBe("country#NZ#enclosure#A1");
  });

  it("should handle single parameter template", () => {
    const pk = partitionKey`country#${"country"}`;
    const result = pk({ country: "NZ" });
    expect(result).toBe("country#NZ");
  });

  it("should handle complex template with multiple parameters", () => {
    const pk = partitionKey`type#${"type"}#id#${"id"}#status#${"status"}`;
    const result = pk({ type: "user", id: "123", status: "active" });
    expect(result).toBe("type#user#id#123#status#active");
  });

  it("should handle empty string values", () => {
    const pk = partitionKey`country#${"country"}#enclosure#${"enclosure"}`;
    const result = pk({ country: "", enclosure: "" });
    expect(result).toBe("country##enclosure#");
  });

  it("should handle special characters in values", () => {
    const pk = partitionKey`country#${"country"}#enclosure#${"enclosure"}`;
    const result = pk({ country: "NZ#123", enclosure: "A1@test" });
    expect(result).toBe("country#NZ#123#enclosure#A1@test");
  });

  it("should handle numeric values converted to strings", () => {
    const pk = partitionKey`id#${"id"}#version#${"version"}`;
    const result = pk({ id: "123", version: "1" });
    expect(result).toBe("id#123#version#1");
  });

  it("should handle multiple segments with the same parameter", () => {
    const pk = partitionKey`type#${"type"}#id#${"id"}#type#${"type"}`;
    const result = pk({ type: "user", id: "123" });
    expect(result).toBe("type#user#id#123#type#user");
  });

  it("should handle undefined parameters", () => {
    const pk = partitionKey`type#${"type"}#id#${"id"}#status#${"status"}`;
    // @ts-expect-error - status is undefined intentionally for this test
    expect(() => pk({ type: "test", id: "last" })).toThrow();
  });
});
