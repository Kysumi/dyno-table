import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "../../src/table";

const dbClient = DynamoDBDocument.from(
	new DynamoDBClient({
		region: "ap-southeast-2",
	}),
);
const table = new Table({
	client: dbClient,
	gsiIndexes: {
		primary: {
			pkName: "pk",
			skName: "sk",
		},
	},
	tableName: "application-table",
});

const user = await table.get({
	pk: "userId#1123",
	sk: "userName#Scott",
});

const users = await table.nativeQuery(
	{
		pk: "users",
	},
	{
		indexName: "gsi1",
		limit: 100,
		filters: [
			{
				field: "name",
				operator: "=",
				value: "Scott",
			},
		],
	},
);

const fluentUsers = await table
	.query({ pk: "users" })
	.whereEquals("name", "Scott")
	.useIndex("gsi1")
	.limit(100)
	.execute();
