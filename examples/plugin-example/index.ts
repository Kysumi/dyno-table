import { z } from "zod";
import type { RepositoryPlugin } from "../../src/repository/types";
import { BaseRepository, Table } from "../../src";
import { dbClient } from "../db-client";

const UserSchema = z.object({
	id: z.string(),
	name: z.string(),
	age: z.number(),
	status: z.enum(["active", "inactive"]),
	deletedAt: z.date().optional(),
});

type TUser = z.infer<typeof UserSchema>;

class UserRepo extends BaseRepository<TUser> {
	protected override createPrimaryKey(data: TUser) {
		return {
			pk: `userId#${data.id}`,
			sk: `userName#${data.name}`,
		};
	}

	protected getTypeAttributeName() {
		return "_type";
	}

	protected getType(): string {
		return "user";
	}

	findAllUsersForOrganisation(organisationId: string) {
		return this.query({
			pk: `organisation#${organisationId}`,
			sk: { operator: "begins_with", value: "userId#" },
		}).useIndex("gsi1");
	}
}

const defaultFilterPlugin: RepositoryPlugin<TUser> = {
	name: "defaultFilter",
	hooks: {
		beforeQuery: async (key, builder) => {
			// Add default active user filter
			builder.where("status", "=", "active");
		},
	},
};

// Example usage with a soft delete plugin
const softDeletePlugin: RepositoryPlugin<TUser> = {
	name: "softDelete",
	hooks: {
		beforeFind: async (key, builder) => {
			// Exclude soft deleted records by default
			builder.whereNotExists("deletedAt");
		},
		beforeUpdate: async (key, data, builder) => {
			// Ensure we're not updating deleted records
			builder.whereNotExists("deletedAt");
			return data;
		},
	},
};

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

// Using the plugins
const userRepository = new UserRepo(table);
await userRepository.use(defaultFilterPlugin);
await userRepository.use(softDeletePlugin);
