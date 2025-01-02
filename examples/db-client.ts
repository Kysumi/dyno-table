import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

export const dbClient = DynamoDBDocument.from(
	new DynamoDBClient({
		region: "ap-southeast-2",
		endpoint: "http://localhost:8000",
	}),
);
