import { CreateTableCommand, DeleteTableCommand, ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import { ddbClient } from "./ddb-client";

const TABLE_NAME = "TestTable";

const makeNewTable = async () => {
  try {
    await ddbClient.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
          { AttributeName: "GSI1PK", AttributeType: "S" },
          { AttributeName: "GSI1SK", AttributeType: "S" },
        ],
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: "GSI1",
            KeySchema: [
              { AttributeName: "GSI1PK", KeyType: "HASH" },
              { AttributeName: "GSI1SK", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      }),
    );
  } catch (error) {
    console.error("Error creating table:", error);
    throw error;
  }
};

export const createTestTable = async () => {
  // Try to delete the table if it exists
  try {
    await ddbClient.send(new DeleteTableCommand({ TableName: TABLE_NAME }));
    // Wait a bit for the deletion to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch (error) {
    // Ignore if table doesn't exist
    if (!(error instanceof ResourceNotFoundException)) {
      console.error("Error deleting table:", error);
    }
  }

  // Create new table
  await makeNewTable();

  // Wait a bit for the table to be ready
  await new Promise((resolve) => setTimeout(resolve, 100));
};

export const deleteTestTable = async () => {
  try {
    await ddbClient.send(new DeleteTableCommand({ TableName: TABLE_NAME }));
  } catch (error) {
    // Ignore cleanup errors
    console.log("Cleanup error:", error);
  }
};
