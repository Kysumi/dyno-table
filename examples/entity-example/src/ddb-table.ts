import { CreateTableCommand, DescribeTableCommand, ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = "JurassicPark";

async function tableExists(docClient: DynamoDBDocument): Promise<boolean> {
  try {
    await docClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    return true;
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      return false;
    }
    throw error;
  }
}

export const createTable = async (docClient: DynamoDBDocument) => {
  // Check if the table already exists
  const exists = await tableExists(docClient);

  if (!exists) {
    console.log(`🏗️ Creating table "${TABLE_NAME}"...`);
    await docClient.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
        ],
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      }),
    );
    console.log(`✅ Table "${TABLE_NAME}" created successfully.`);
  } else {
    console.log(`✅ Table "${TABLE_NAME}" already exists, using existing table.`);
  }
};
