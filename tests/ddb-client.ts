import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

export const ddbClient = new DynamoDBClient({
  endpoint: "http://localhost:8897",
  region: "local",
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
});

export const docClient = DynamoDBDocument.from(ddbClient);
