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
	protected getTypeAttributeName(): string {
		return "_type";
	}
	protected getType(): string {
		return "user";
	}
	protected createPrimaryKey(data) {
		return {
			pk: `userId#${data.id}`,
			sk: `userName#${data.name}`,
		};
	}

	findAllUsersForOrganisation(organisationId: string) {
		return this.table
			.query({
				pk: `organisation#${organisationId}`,
				sk: { operator: "begins_with", value: "userId#" },
			})
			.whereEquals(this.getTypeAttributeName(), this.getType());
	}
}

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

const userRepo = new UserRepo(table, UserSchema);

userRepo.create({
	age: 10,
	id: "1123",
	name: "Scott",
});

userRepo.findOrFail({
	pk: "userId#1123",
});

userRepo
	.findAllUsersForOrganisation("123")
	.whereLessThan("age", 65)
	.whereGreaterThan("age", 21)
	.execute();
