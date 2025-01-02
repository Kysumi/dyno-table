import { BaseRepository } from "../../src/repository/base-repository";
import z from "zod";
import { Table } from "../../src/table";
import { dbClient } from "../db-client";

const UserSchema = z.object({
	id: z.string(),
	name: z.string(),
	age: z.number(),
});

class UserRepo extends BaseRepository<typeof UserSchema> {
	protected getType(): string {
		return "user";
	}
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
