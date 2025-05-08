import { defineEntity, createQueries, createIndex } from "../src/entity";
import type { StandardSchemaV1 } from "../src/standard-schema";
import { partitionKey } from "../src/utils/key-template";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "../src/table";

// Define a simple User entity
interface User extends Record<string, unknown> {
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

interface UserIndexQuery extends Record<string, unknown> {
  id: string;
  age: number;
}

const userIndexQuerySchema: StandardSchemaV1<UserIndexQuery> = {
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

      if (typeof user.age !== "number") {
        issues.push({ message: "age must be a number" });
      }

      if (issues.length > 0) {
        return { issues };
      }

      return { value: user };
    },
    types: {
      input: {} as UserIndexQuery,
      output: {} as UserIndexQuery,
    },
  },
};

// Define key templates
const userPK = partitionKey`${"id"}`;
const userSK = "METADATA";

// Create a primary index using entity isolation
const primaryKey = createIndex()
  .input(userIndexQuerySchema)
  .partitionKey(({ id }) => userPK({ id }))
  .withoutSortKey();

const createQuery = createQueries<User>();

// Define the User entity
const UserEntity = defineEntity<User, UserIndexQuery>({
  name: "User",
  schema: userSchema,
  primaryKey,
  queries: {
    byId: createQuery.input(userIndexQuerySchema).query(({ input, entity }) => {
      return entity.scan().filter((op) => (input.age !== undefined ? op.eq("age", input.age) : op.gt("age", -1)));
    }),
    temp: createQuery.input(userSchema).query(({ input, entity }) => {
      return entity
        .query({
          pk: userPK({ id: input.id }),
          sk: userSK,
        })
        .filter((op) => op.eq("age", input.age));
    }),
    another: createQuery.input(userSchema).query(({ input, entity }) => {
      return entity.get({
        pk: userPK({ id: input.id }),
        sk: userSK,
      });
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

  const userRepo = UserEntity.createRepository(table);

  // Example user data
  const user: User = {
    id: "user123",
    name: "John Doe",
    email: "john@example.com",
    age: 30,
  };

  // Create a user
  await userRepo.create(user).execute();

  // Query users by age
  const users = await userRepo.query.byId({ age: 30 }).execute();

  // Update the user - id and age are required attributes because that's what we defined in userIndexQuerySchema
  const temp = await userRepo.update({ id: "user123" }, { age: 31 }).execute();
  await userRepo.delete({ id: "user123" }).execute();

  console.log("Users:", users);
}
