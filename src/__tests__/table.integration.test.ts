import { beforeAll, describe, expect, it, beforeEach, afterEach } from "vitest";
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
		// Initialize DynamoDB client with local endpoint
		ddbClient = new DynamoDBClient({
			endpoint: "http://localhost:8000", // Local DynamoDB endpoint
			region: "local",
			credentials: {
				accessKeyId: "local",
				secretAccessKey: "local",
			},
		});

		docClient = DynamoDBDocument.from(ddbClient);

		// Initialize Table instance
		table = new Table({
			client: docClient,
			tableName: "TestTable",
			gsiIndexes: {
				base: {
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
			// Create
			await table.put(testItem).execute();

			// Get
			const retrievedItem = await table.get({
				pk: testItem.pk,
				sk: testItem.sk,
			});
			expect(retrievedItem).toEqual(testItem);

			// Update
			const updates = {
				email: "john.doe@example.com",
				age: 31,
			};
			await table
				.update({ pk: testItem.pk, sk: testItem.sk })
				.set("email", updates.email)
				.set("age", updates.age)
				.execute();

			// Get updated item
			const updatedItem = await table.get({
				pk: testItem.pk,
				sk: testItem.sk,
			});
			expect(updatedItem).toEqual({ ...testItem, ...updates });

			// Delete
			await table.delete({ pk: testItem.pk, sk: testItem.sk });

			// Verify deletion
			const deletedItem = await table.get({
				pk: testItem.pk,
				sk: testItem.sk,
			});
			expect(deletedItem).toBeUndefined();
		});
	});

	describe("Query Operations", () => {
		beforeEach(async () => {
			// Insert test item before each query test
			await table.put(testItem).execute();
		});

		it("should query items by partition key", async () => {
			const result = await table
				.query({ pk: testItem.pk })
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
			// Insert test item before each scan test
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
			// Batch write (put)
			await table.batchWrite(
				batchItems.map((item) => ({
					type: "put",
					item,
				})),
			);

			// Verify items were written
			for (const item of batchItems) {
				const result = await table.get({ pk: item.pk, sk: item.sk });
				expect(result).toEqual(item);
			}

			// Batch write (delete)
			await table.batchWrite(
				batchItems.map((item) => ({
					type: "delete",
					key: { pk: item.pk, sk: item.sk },
				})),
			);

			// Verify items were deleted
			for (const item of batchItems) {
				const result = await table.get({ pk: item.pk, sk: item.sk });
				expect(result).toBeUndefined();
			}
		});
	});

	describe("Transaction Operations", () => {
		it("should perform transactional writes", async () => {
			const transactItems = [
				{
					Put: {
						TableName: "TestTable",
						Item: testItem,
					},
				},
				{
					Put: {
						TableName: "TestTable",
						Item: { ...testItem, pk: "USER#124", sk: "PROFILE#124" },
					},
				},
			];

			await table.transactWrite(transactItems);

			// Verify items were written
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
			// Put with condition that item doesn't exist
			await table.put(testItem).whereNotExists("pk").execute();

			// Attempt to put again with same condition should fail
			await expect(
				table.put(testItem).whereNotExists("pk").execute(),
			).rejects.toThrow();
		});

		it("should handle conditional updates", async () => {
			// Insert initial item
			await table.put(testItem).execute();

			// Update with condition
			await table
				.update({ pk: testItem.pk, sk: testItem.sk })
				.set("age", 31)
				.whereEquals("age", 30)
				.execute();

			const updatedItem = await table.get({
				pk: testItem.pk,
				sk: testItem.sk,
			});
			expect(updatedItem?.age).toBe(31);
		});
	});
});
