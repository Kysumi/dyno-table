import { beforeAll, describe, expect, it, beforeEach } from "vitest";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "../table";

describe("Table Integration Tests", () => {
	let ddbClient: DynamoDBClient;
	let docClient: DynamoDBDocument;
	let table: Table;

	// Test item data
	const testItem = {
		pk: "USER#123",
		sk: "PROFILE#123",
		name: "John Doe",
		email: "john@example.com",
		age: 30,
		type: "USER",
	};

	beforeAll(() => {
		ddbClient = new DynamoDBClient({
			endpoint: "http://localhost:8000",
			region: "local",
			credentials: {
				accessKeyId: "local",
				secretAccessKey: "local",
			},
		});

		docClient = DynamoDBDocument.from(ddbClient);

		table = new Table({
			client: docClient,
			tableName: "TestTable",
			tableIndexes: {
				primary: {
					pkName: "pk",
					skName: "sk",
				},
				GSI1: {
					pkName: "GSI1PK",
					skName: "GSI1SK",
				},
			},
		});
	});

	beforeEach(async () => {
		// Clean up any existing data before each test
		try {
			await table.delete({ pk: testItem.pk, sk: testItem.sk });
		} catch (error) {
			// Ignore if item doesn't exist
		}
	});

	describe("CRUD Operations", () => {
		it("should create, get, update, and delete an item", async () => {
			await table.put(testItem).execute();

			const retrievedItem = await table.get({
				pk: testItem.pk,
				sk: testItem.sk,
			});
			expect(retrievedItem).toEqual(testItem);

			const updates = {
				email: "john.doe@example.com",
				age: 31,
			};
			await table
				.update({ pk: testItem.pk, sk: testItem.sk })
				.set("email", updates.email)
				.set("age", updates.age)
				.execute();

			const updatedItem = await table.get({
				pk: testItem.pk,
				sk: testItem.sk,
			});
			expect(updatedItem).toEqual({ ...testItem, ...updates });

			await table.delete({ pk: testItem.pk, sk: testItem.sk });

			const deletedItem = await table.get({
				pk: testItem.pk,
				sk: testItem.sk,
			});
			expect(deletedItem).toBeUndefined();
		});
	});

	describe("Query Operations", () => {
		beforeEach(async () => {
			await table.put(testItem).execute();
		});

		it("should get back no results, when the filter doesn't match", async () => {
			const result = await table
				.query({ pk: testItem.pk })
				.where("type", "=", "APPLE")
				.execute();

			expect(result.Items).toHaveLength(0);
		});

		it("should query items by partition key", async () => {
			const result = await table
				.query({
					pk: testItem.pk,
					sk: testItem.sk,
				})
				.where("type", "=", "USER")
				.execute();

			expect(result.Items).toHaveLength(1);
			expect(result.Items?.[0]).toEqual(testItem);
		});

		it("should query items with begins_with sort key", async () => {
			const result = await table
				.query({
					pk: testItem.pk,
					sk: { operator: "begins_with", value: "PROFILE#" },
				})
				.execute();

			expect(result.Items).toHaveLength(1);
			expect(result.Items?.[0]).toEqual(testItem);
		});
	});

	describe("Scan Operations", () => {
		beforeEach(async () => {
			await table.put(testItem).execute();
		});

		it("should scan and filter items", async () => {
			const result = await table.scan([
				{ field: "type", operator: "=", value: "USER" },
				{ field: "age", operator: ">", value: 25 },
			]);

			expect(result.Items).toBeDefined();
			expect(result.Items).toContainEqual(testItem);
		});
	});

	describe("Batch Operations", () => {
		const batchItems = [
			{ ...testItem, pk: "USER#123", sk: "PROFILE#123" },
			{ ...testItem, pk: "USER#124", sk: "PROFILE#124", name: "Jane Doe" },
		];

		it("should perform batch write operations", async () => {
			await table.batchWrite(
				batchItems.map((item) => ({
					type: "put",
					item,
				})),
			);

			for (const item of batchItems) {
				const result = await table.get({ pk: item.pk, sk: item.sk });
				expect(result).toEqual(item);
			}

			await table.batchWrite(
				batchItems.map((item) => ({
					type: "delete",
					key: { pk: item.pk, sk: item.sk },
				})),
			);

			for (const item of batchItems) {
				const result = await table.get({ pk: item.pk, sk: item.sk });
				expect(result).toBeUndefined();
			}
		});
	});

	describe("Transaction Operations", () => {
		it("should perform transactional writes", async () => {
			await table.transactWrite([
				{
					put: {
						item: testItem,
					},
				},
				{
					put: {
						item: { ...testItem, pk: "USER#124", sk: "PROFILE#124" },
					},
				},
			]);

			const item1 = await table.get({ pk: testItem.pk, sk: testItem.sk });
			const item2 = await table.get({
				pk: "USER#124",
				sk: "PROFILE#124",
			});

			expect(item1).toEqual(testItem);
			expect(item2).toEqual({ ...testItem, pk: "USER#124", sk: "PROFILE#124" });
		});
	});

	describe("Conditional Operations", () => {
		it("should handle conditional puts", async () => {
			// First put should succeed
			await table
				.put(testItem)
				.whereNotExists("pk")
				.whereNotExists("sk")
				.execute();

			// Verify item was created
			const item = await table.get({ pk: testItem.pk, sk: testItem.sk });
			expect(item).toEqual(testItem);

			// Second put with same condition should fail
			await expect(
				table
					.put({ pk: testItem.pk, sk: testItem.sk, banana: true })
					.whereNotExists("pk")
					.execute(),
			).rejects.toThrow();

			// Verify item wasn't modified
			const unchangedItem = await table.get({
				pk: testItem.pk,
				sk: testItem.sk,
			});
			expect(unchangedItem).toEqual(testItem);
		});

		it("should handle conditional updates", async () => {
			await table.put(testItem).whereNotExists("pk").execute();

			// Verify item was created
			const item = await table.get({ pk: testItem.pk, sk: testItem.sk });
			expect(item).toEqual(testItem);

			// Update with matching condition should succeed
			await table
				.update({ pk: testItem.pk, sk: testItem.sk })
				.set("age", 20)
				.whereEquals("age", 30)
				.execute();

			// Verify update succeeded
			const updatedItem = await table.get({
				pk: testItem.pk,
				sk: testItem.sk,
			});

			expect(updatedItem?.age).toBe(20);

			// Update with non-matching condition should fail
			await expect(
				table
					.update({ pk: testItem.pk, sk: testItem.sk })
					.set("age", 32)
					.whereEquals("age", 30) // Incorrect age
					.execute(),
			).rejects.toThrow();

			// Verify item wasn't modified
			const unchangedItem = await table.get({
				pk: testItem.pk,
				sk: testItem.sk,
			});
			expect(unchangedItem?.age).toBe(20);
		});
	});
});
