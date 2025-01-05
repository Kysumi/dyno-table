import { describe, it, expect, beforeEach } from "vitest";
import type { DynamoRecord } from "../../builders/types";
import { TimestampsPlugin } from "../timestamps-plugin";

interface TestRecord extends DynamoRecord {
	id: string;
	createdAt?: string;
	updatedAt?: string;
}

describe("TimestampsPlugin", () => {
	let plugin: TimestampsPlugin<TestRecord>;
	const config = [
		{ attributeName: "createdAt" },
		{ attributeName: "updatedAt", onUpdate: true },
	];

	beforeEach(() => {
		plugin = new TimestampsPlugin<TestRecord>(config);
	});

	it("should add createdAt and updatedAt timestamp on create", async () => {
		const data: TestRecord = { id: "1" };
		const result = await plugin.hooks.beforeCreate(data);

		expect(result).toHaveProperty("createdAt");
		expect(result.createdAt).toBeTruthy();
		expect(result).toHaveProperty("updatedAt");
	});

	it("should add updatedAt timestamp on update", async () => {
		const updates: Partial<TestRecord> = { id: "1" };
		const key = { pk: "1" };
		const result = await plugin.hooks.beforeUpdate(key, updates);

		expect(result).toHaveProperty("updatedAt");
		expect(result.updatedAt).toBeTruthy();
		// Should not add createdAt timestamp
		expect(result).not.toHaveProperty("createdAt");
	});

	it("should not add updatedAt timestamp if onUpdate is false", async () => {
		const customConfig = [{ attributeName: "createdAt" }];
		const customPlugin = new TimestampsPlugin<TestRecord>(customConfig);
		const updates: Partial<TestRecord> = { id: "1" };
		const key = { pk: "1" };

		const result = await customPlugin.hooks.beforeUpdate(key, updates);

		expect(result).not.toHaveProperty("updatedAt");
		expect(result).not.toHaveProperty("createdAt");
	});

	it("assert that random names work", async () => {
		const customConfig = [{ attributeName: "insUpdTS" }];
		const customPlugin = new TimestampsPlugin<TestRecord>(customConfig);
		const data: TestRecord = { id: "1" };

		const result = await customPlugin.hooks.beforeCreate(data);

		expect(result).toHaveProperty("insUpdTS");
	});
});
