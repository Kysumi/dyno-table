import { beforeAll, describe, expect, it, beforeEach, afterEach } from "vitest";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "../../table";
import { BaseRepository } from "../base-repository";
import { TimestampsPlugin } from "../../plugins/timestamps-plugin";

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
    let ddbClient: DynamoDBClient;
    let docClient: DynamoDBDocument;
    let table: Table;
    let userRepository: UserRepository;

    const testUser: UserRecord = {
      id: "123",
      name: "John Doe",
      email: "john@example.com",
      age: 30,
    };

    beforeAll(() => {
      ddbClient = new DynamoDBClient({
        endpoint: "http://localhost:8000",
        region: "local",
        credentials: {
          accessKeyId: "local",
          secretAccessKey: "local",
        },
      });

      docClient = DynamoDBDocument.from(ddbClient);

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
      userRepository.use(
        new TimestampsPlugin<UserRecord>([
          { attributeName: "createdAt" },
          { attributeName: "updatedAt", onUpdate: true },
        ]),
      );
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