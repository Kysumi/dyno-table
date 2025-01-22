import { beforeAll, describe, expect, it, beforeEach, afterEach } from "vitest";
import { Table } from "../../table";
import { BaseRepository } from "../base-repository";
import { docClient } from "../../../tests/ddb-client";

type UserRecord = {
  id: string;
  name: string;
  email: string;
  age: number;
  createdAt?: string;
  updatedAt?: string;
};

const tableIndexes = {
  primary: {
    pkName: "pk",
    skName: "sk",
  },
};

class UserRepository extends BaseRepository<UserRecord, keyof typeof tableIndexes> {
  protected createPrimaryKey(data: UserRecord) {
    return {
      pk: `USER#${data.id}`,
      sk: `PROFILE#${data.id}`,
    };
  }

  protected getType() {
    return "USER";
  }

  protected getTypeAttributeName(): string {
    return "_type";
  }
}

describe("BaseRepository Integration Tests", () => {
  let table: Table<keyof typeof tableIndexes>;
  let userRepository: UserRepository;

  const testUser: UserRecord = {
    id: "123",
    name: "John Doe",
    email: "john@example.com",
    age: 30,
  };

  beforeAll(() => {
    table = new Table({
      client: docClient,
      tableName: "TestTable",
      tableIndexes,
    });

    userRepository = new UserRepository(table);
  });

  beforeEach(async () => {
    // Clean up any existing data before each test
    try {
      await userRepository.delete({ pk: `USER#${testUser.id}`, sk: `PROFILE#${testUser.id}` });
    } catch (error) {
      // Ignore if item doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up any existing data after each test
    try {
      await userRepository.delete({ pk: `USER#${testUser.id}`, sk: `PROFILE#${testUser.id}` });
    } catch (error) {
      // Ignore if item doesn't exist
    }
  });

  it("should create a new user", async () => {
    const createdUser = await userRepository
      .create({
        ...testUser,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .execute();

    // Using the table instance to get the item to ensure no default filtering is applied
    const item = await table.get({ pk: `USER#${testUser.id}`, sk: `PROFILE#${testUser.id}` });

    expect(item).toHaveProperty("createdAt");
    expect(item).toHaveProperty("updatedAt");
    expect(item).toEqual(createdUser);
  });

  it("should update an existing user", async () => {
    await userRepository.create(testUser).execute();

    const updates = {
      email: "john.doe@example.com",
      age: 31,
    };

    const updatedUser = await userRepository
      .update({ pk: `USER#${testUser.id}`, sk: `PROFILE#${testUser.id}` }, updates)
      .execute();

    expect(updatedUser).toHaveProperty("updatedAt");
    expect(updatedUser?.email).toBe(updates.email);
    expect(updatedUser?.age).toBe(updates.age);
  });

  it("should delete a user", async () => {
    await userRepository.create(testUser).execute();
    await userRepository.delete({ pk: `USER#${testUser.id}`, sk: `PROFILE#${testUser.id}` }).execute();

    const deletedUser = await userRepository.findOne({
      pk: `USER#${testUser.id}`,
      sk: `PROFILE#${testUser.id}`,
    });

    expect(deletedUser).toBeNull();
  });

  it("should find a user by primary key", async () => {
    const user = await userRepository.create(testUser).execute();

    const retrievedUser = await userRepository.findOne({
      pk: `USER#${testUser.id}`,
      sk: `PROFILE#${testUser.id}`,
    });

    expect(retrievedUser).toEqual(user);
  });

  it("repository isolation should be in place", async () => {
    // Insert item via REPO
    await userRepository.create(testUser).execute();

    // Inserting another item so it will get picked up by a begins_with query
    table
      .put({
        pk: `USER#${testUser.id}`,
        sk: `PROFILE#${testUser.id}-another`,
        ...testUser,
      })
      .execute();

    const retrievedUsers = await userRepository
      .query({
        pk: `USER#${testUser.id}`,
        sk: {
          operator: "begins_with",
          value: "PROFILE#",
        },
      })
      .execute();

    // We expect that the user repo query to only return the user that was inserted via the repo
    // due to the isolation of the repository
    expect(retrievedUsers).toHaveLength(1);

    // Proving the DB had 2 items in it with the PK/SK we queried for
    const allUsers = await table
      .query({ pk: `USER#${testUser.id}`, sk: { operator: "begins_with", value: "PROFILE#123" } })
      .execute();

    expect(allUsers).toHaveLength(2);
  });

  it("should throw an error if user not found", async () => {
    await expect(userRepository.findOrFail({ pk: "USER#nonexistent", sk: "PROFILE#nonexistent" })).rejects.toThrow(
      Error,
    );
  });
});
