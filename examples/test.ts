import { defineEntity, createIndex, createQueries } from "../src/entity";
import type { StandardSchemaV1 } from "../src/standard-schema";
import { partitionKey } from "../src/utils/key-template";
import { sortKey } from "../src/utils/sort-key-template";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "../src/table";

// Define a simple User entity
interface User {
  id: string;
  name: string;
  email: string;
  age: number;
  createdAt?: string;
}

// Create a simple schema for validation
const userSchema: StandardSchemaV1<User> = {
  "~standard": {
    version: 1,
    vendor: "dyno-table",
    validate: (value: unknown) => {
      if (typeof value !== "object" || value === null) {
        return {
          issues: [{ message: "Value must be an object" }],
        };
      }

      const user = value as User;
      const issues: StandardSchemaV1.Issue[] = [];

      if (typeof user.id !== "string") {
        issues.push({ message: "id must be a string" });
      }
      if (typeof user.name !== "string") {
        issues.push({ message: "name must be a string" });
      }
      if (typeof user.email !== "string") {
        issues.push({ message: "email must be a string" });
      }
      if (typeof user.age !== "number") {
        issues.push({ message: "age must be a number" });
      }

      if (issues.length > 0) {
        return { issues };
      }

      return { value: user };
    },
    types: {
      input: {} as User,
      output: {} as User,
    },
  },
};

// Define key templates
const userPK = partitionKey`USER#${"id"}`;
const userSK = sortKey`METADATA`;

// Create primary index
const primaryKey = createIndex<User>()
  .partitionKey(({ id }) => userPK({ id }))
  .withoutSortKey();

const createQuery = createQueries<User>();

// Define the User entity
const UserEntity = defineEntity({
  name: "User",
  schema: userSchema,
  primaryKey,
  queries: {
    byId: createQuery.input(userSchema).query(({ input, entity }) => {
        entity.
    }),
  },
});

const docClient = DynamoDBDocument.from(
  new DynamoDBClient({
    region: "us-east-1",
    endpoint: "http://localhost:8897",
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  }),
);

const table = new Table({
  client: docClient,
  tableName: "TestTable",
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
  },
});

// Example usage
async function main() {
  // In a real application, you would connect to a DynamoDB table
  // const table = new Table({ ... });
  // const userRepository = UserEntity.createRepository(table);

  console.log("User entity defined successfully!");
  console.log("Entity name:", UserEntity.name);

  // Example user data
  const user: User = {
    id: "user123",
    name: "John Doe",
    email: "john@example.com",
    age: 30,
  };

  const userRepo = UserEntity.createRepository(table);
  userRepo.create(user).execute();

  userRepo.query;

  console.log("Example user:", user);
}

// This would be executed in a real application
// main().catch(console.error);

// Export the entity for use in other files
export { UserEntity };
export type { User };
