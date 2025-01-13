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

class UserRepository extends BaseRepository<UserRecord> {
  protected createPrimaryKey(data: UserRecord) {
    return {
      pk: `USER#${data.id}`,
      sk: `PROFILE#${data.id}`,
    };
  }

  protected getType() {
    return "USER";
  }

  protected getTypeAttributeName() {
    return "type";
  }
}

export const baseRepositorySuite = () =>
  describe("BaseRepository Integration Tests", () => {
    let table: Table;
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
        tableIndexes: {
          primary: {
            pkName: "pk",
            skName: "sk",
          },
        },
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
      const createdUser = await userRepository.create(testUser);

      expect(createdUser).toHaveProperty("createdAt");
      expect(createdUser).toHaveProperty("updatedAt");

      const retrievedUser = await userRepository.findOne({
        pk: `USER#${testUser.id}`,
        sk: `PROFILE#${testUser.id}`,
      });

      expect(retrievedUser).toEqual(createdUser);
    });

    it("should update an existing user", async () => {
      await userRepository.create(testUser);

      const updates = {
        email: "john.doe@example.com",
        age: 31,
      };

      const updatedUser = await userRepository.update(
        { pk: `USER#${testUser.id}`, sk: `PROFILE#${testUser.id}` },
        updates,
      );

      expect(updatedUser).toHaveProperty("updatedAt");
      expect(updatedUser?.email).toBe(updates.email);
      expect(updatedUser?.age).toBe(updates.age);
    });

    it("should delete a user", async () => {
      await userRepository.create(testUser);

      await userRepository.delete({ pk: `USER#${testUser.id}`, sk: `PROFILE#${testUser.id}` });

      const deletedUser = await userRepository.findOne({
        pk: `USER#${testUser.id}`,
        sk: `PROFILE#${testUser.id}`,
      });

      expect(deletedUser).toBeNull();
    });

    it("should find a user by primary key", async () => {
      const createdUser = await userRepository.create(testUser);

      const retrievedUser = await userRepository.findOne({
        pk: `USER#${testUser.id}`,
        sk: `PROFILE#${testUser.id}`,
      });

      expect(retrievedUser).toEqual(createdUser);
    });

    it("should throw an error if user not found", async () => {
      await expect(userRepository.findOrFail({ pk: "USER#nonexistent", sk: "PROFILE#nonexistent" })).rejects.toThrow(
        "USER not found",
      );
    });
  });
