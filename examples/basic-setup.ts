import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "../src";

/**
 * You can start a local DynamoDB instance with the following command:
 *
 * ```bash
 * docker run -d -p 8000:8000 --name local-dynamodb amazon/dynamodb-local -jar DynamoDBLocal.jar -inMemory -sharedDb
 * ```
 *
 * Then to see how to create the table, take a look at the following file:
 *
 * tests/setup-test-table.ts
 */

// Initialize the DynamoDB client
const client = new DynamoDBClient({
  region: "us-east-1",
  // For local development with DynamoDB local
  ...(process.env.NODE_ENV === "development" && {
    endpoint: "http://localhost:8000",
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  }),
});

const docClient = DynamoDBDocument.from(client);

// Initialize the table with single-table design schema
// Note: In a real application, you would need to check the actual Table constructor
// parameters as they may differ from what's shown in the examples
const dinoTable = new Table({
  client: docClient,
  tableName: "JurassicPark",
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
    gsis: {
      speciesId: {
        partitionKey: "gsi1pk",
        sortKey: "gsi1sk",
      },
    },
  },
});

// Example usage
const main = async () => {
  try {
    console.log("🦖 DynoTable Dinosaur Example 🦖");

    // Define a dinosaur type
    interface Dinosaur {
      pk: string;
      sk: string;
      speciesId: string;
      name: string;
      diet: "carnivore" | "herbivore" | "omnivore";
      length: number;
      weight: number;
      era: "Triassic" | "Jurassic" | "Cretaceous";
      isActive: boolean;
      lastSeen?: string;
    }

    // Create a new dinosaur
    // Note: In a real application, you would need to check the actual API
    // as it may differ from what's shown in the examples
    console.log("Creating T-Rex...");
    const trexData = {
      pk: "SPECIES#trex",
      sk: "PROFILE#001",
      speciesId: "trex",
      name: "Tyrannosaurus Rex",
      diet: "carnivore",
      length: 12.3,
      weight: 8000,
      era: "Cretaceous",
      isActive: true,
      lastSeen: new Date().toISOString(),
    };

    // Using the documented API pattern from the README
    await dinoTable.put(trexData).execute();
    console.log("T-Rex created successfully");

    // Create another dinosaur
    console.log("Creating Velociraptor...");
    const raptorData = {
      pk: "SPECIES#velociraptor",
      sk: "PROFILE#001",
      speciesId: "velociraptor",
      name: "Velociraptor",
      diet: "carnivore",
      length: 2.07,
      weight: 15,
      era: "Cretaceous",
      isActive: true,
      lastSeen: new Date().toISOString(),
    };

    await dinoTable.put(raptorData).execute();
    console.log("Velociraptor created successfully");

    // Get the T-Rex
    console.log("Retrieving T-Rex...");
    const getResult = await dinoTable
      .get({
        pk: "SPECIES#trex",
        sk: "PROFILE#001",
      })
      .execute();

    if (getResult?.item) {
      console.log("Retrieved dinosaur:", getResult.item);
    } else {
      console.log("T-Rex not found");
    }

    // Update the T-Rex
    console.log("Updating T-Rex...");
    await dinoTable
      .update({
        pk: "SPECIES#trex",
        sk: "PROFILE#001",
      })
      .set("weight", 8200)
      .set("lastSeen", new Date().toISOString())
      .execute();

    console.log("T-Rex updated successfully");

    // Query for all dinosaurs of a specific species
    console.log("Querying for T-Rex specimens...");
    const queryResult = await dinoTable
      .query({
        pk: "SPECIES#trex",
      })
      .execute();

    if (queryResult?.items) {
      console.log("All T-Rex specimens:", queryResult.items);
    } else {
      console.log("No T-Rex specimens found");
    }

    // Delete the Velociraptor
    console.log("Deleting Velociraptor...");
    await dinoTable
      .delete({
        pk: "SPECIES#velociraptor",
        sk: "PROFILE#001",
      })
      .execute();

    console.log("Velociraptor deleted successfully");
  } catch (error) {
    console.error("Error:", error);
  }
};

if (require.main === module) {
  main();
}
