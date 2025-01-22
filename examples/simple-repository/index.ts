import { BaseRepository } from "../../src/repository/base-repository";
import { Table } from "../../src/table";
import { dbClient } from "../db-client";

type TUser = {
  id: string;
  name: string;
  age: number;
};

const tableIndexes = {
  primary: {
    pkName: "pk",
    skName: "sk",
  },
  gsi1: {
    pkName: "gsi1pk",
    skName: "gsi1sk",
  },
};

class UserRepo extends BaseRepository<TUser, keyof typeof tableIndexes> {
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

const table = new Table({
  client: dbClient,
  tableIndexes,
  tableName: "application-table",
});

const userRepo = new UserRepo(table);

userRepo
  .create({
    age: 10,
    id: "1123",
    name: "Scott",
  })
  .execute();

userRepo.findOrFail({
  pk: "userId#1123",
});

userRepo.findAllUsersForOrganisation("123").whereLessThan("age", 65).whereGreaterThan("age", 21).execute();
