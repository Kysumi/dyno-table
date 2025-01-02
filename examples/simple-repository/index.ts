import { BaseRepository } from "../../src/repository/base-repository";
import z from "zod";
import { Table } from "../../src/table";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const UserSchema = z.object({
	id: z.string(),
	name: z.string(),
	age: z.number(),
});

class UserRepo extends BaseRepository<typeof UserSchema> {
	protected createPrimaryKey(data) {
		return {
			pk: `userId#${data.id}`,
			sk: `userName#${data.name}`,
		};
	}
	protected getIndexKeys(): { pk: string; sk?: string } {
		throw new Error("Method not implemented.");
	}
}

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

const users = new UserRepo(table, UserSchema);

users.create({
	age: 10,
	id: "1123",
	name: "Scott",
});
