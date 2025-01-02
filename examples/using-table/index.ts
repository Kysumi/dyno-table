import { ExpressionBuilder } from "../../src/builders/expression-builder";
import { QueryBuilder } from "../../src/builders/query-builder";
import { Table } from "../../src/table";
import { dbClient } from "../db-client";

const table = new Table({
	client: dbClient,
	tableIndexes: {
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

const builder = new QueryBuilder(
	table,
	{ pk: "users" },
	new ExpressionBuilder(),
);

const builtUsers = await builder
	.whereEquals("name", "Scott")
	.useIndex("gsi1")
	.limit(100)
	.execute();
