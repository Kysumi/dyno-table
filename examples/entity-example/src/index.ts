import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import type { EntityRepository } from "dyno-table/entity";
import * as readline from "node:readline";
import { createTable, TABLE_NAME } from "./ddb-table";
import { type Dinosaur, DinosaurEntity } from "./dinosaur-entity";
import { Table } from "dyno-table";

const docClient = DynamoDBDocument.from(
  new DynamoDBClient({
    region: "us-east-1",
    endpoint: "http://localhost:8897", // Local DynamoDB endpoint
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  }),
);

const table = new Table({
  client: docClient,
  tableName: TABLE_NAME,
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
  },
});

const dinosaurs = [
  {
    id: "dino-001",
    species: "Velociraptor",
    name: "Blue",
    diet: "carnivore",
    dangerLevel: 8,
    height: 1.8,
    weight: 75,
    status: "active",
  },
  {
    id: "dino-002",
    species: "Brachiosaurus",
    name: "Tall Tim",
    diet: "herbivore",
    dangerLevel: 3,
    height: 12,
    weight: 35000,
    status: "active",
  },
  {
    id: "dino-003",
    species: "Stegosaurus",
    name: "Spike",
    diet: "herbivore",
    dangerLevel: 5,
    height: 4,
    weight: 5000,
    status: "active",
  },
  {
    id: "dino-004",
    species: "Dilophosaurus",
    name: "Spitter",
    diet: "carnivore",
    dangerLevel: 7,
    height: 2.5,
    weight: 450,
    status: "active",
  },
  {
    id: "dino-005",
    species: "Triceratops",
    name: "Trinity",
    diet: "herbivore",
    dangerLevel: 6,
    height: 3,
    weight: 12000,
    status: "active",
  },
] as const;

async function createDinosaurs(repo: EntityRepository<Dinosaur>) {
  try {
    console.log("🦕 Creating multiple dinosaurs...");

    for (const dino of dinosaurs) {
      console.log(`- Creating ${dino.name} (${dino.species})`);
      await repo.create(dino).execute();
    }

    console.log("✅ Successfully created all dinosaurs!");
  } catch (error) {
    console.error("🔥 Error creating dinosaurs:", error);
  }
}

/**
 * Prompts the user to start Docker containers and waits for confirmation
 * @returns Promise<void>
 */
async function promptForDocker(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log("⚠️  Please ensure Docker containers are running with DynamoDB Local before proceeding.");
    console.log("   You can run `npm run docker` to start them or start them manually with `docker compose up -d`.");
    rl.question("Have you started the Docker containers? (yes/no): ", (answer) => {
      if (answer.toLowerCase() === "yes" || answer.toLowerCase() === "y") {
        console.log("✅ Proceeding with the example...");
        rl.close();
        resolve();
      } else {
        console.log("❌ Please start the Docker containers and run this example again.");
        process.exit(1);
      }
    });
  });
}

// Example usage
async function main() {
  // Prompt the user to start Docker containers first
  await promptForDocker();
  await createTable(docClient);

  console.log("🦖 Dinosaur entity example 🦖");

  // Create a repository for the Dinosaur entity
  const dinosaurRepo = DinosaurEntity.createRepository(table);

  try {
    // Create a dinosaur
    console.log("\n🧬 Creating a dinosaur...");
    const trex = await dinosaurRepo
      .create({
        id: "dino-400",
        species: "Tyrannosaurus Rex",
        name: "Rexy",
        diet: "carnivore",
        dangerLevel: 10,
        height: 5.2,
        // weight: 7000, - weight is optional due to the default value defined on the entity schema
        status: "active",
      })
      .returnValues("CONSISTENT")
      .execute();

    console.log(`Created ${trex?.name} (${trex?.species})`);

    // Retrieve a dinosaur
    console.log("\n🔍 Retrieving a dinosaur...");
    const retrievedDino = await dinosaurRepo
      .get({
        id: "dino-400",
        diet: "carnivore",
        species: "Tyrannosaurus Rex",
      })
      .execute();

    console.log("Retrieved dinosaur:", retrievedDino.item?.name, `(${retrievedDino.item?.species})`);

    // Update a dinosaur
    console.log("\n✏️ Updating a dinosaur...");
    const updatedDino = await dinosaurRepo
      .update(
        {
          id: "dino-400",
          diet: "carnivore",
          species: "Tyrannosaurus Rex",
        },
        {
          weight: 7200, // Rexy gained some weight!
          updatedAt: new Date().toISOString(),
        },
      )
      .execute();

    console.log(`Updated ${updatedDino.item?.name}'s weight to ${updatedDino.item?.weight}kg`);

    await createDinosaurs(dinosaurRepo);

    console.log("Querying dinosaurs by diet...");
    const carnivores = await dinosaurRepo.query.byDiet({ diet: "herbivore" }).execute();
    console.log(`Found ${carnivores.items.length} carnivore dinosaurs:`);
    console.log(carnivores.items.map((dino) => dino.name).join(", "));

    console.log("\n🦖 Scanning dinosaurs by species...");
    const trexes = await dinosaurRepo.query.bySpecies({ species: "Tyrannosaurus Rex" }).execute();

    console.log(`Found ${trexes.items.length} T-Rex dinosaurs:`);
    for (const dino of trexes.items) {
      console.log(`- ${dino.name} (ID: ${dino.id}, Status: ${dino.status})`);
    }

    // Delete a dinosaur
    console.log("\n❌ Deleting a dinosaur...");
    await dinosaurRepo
      .delete({
        id: "dino-400",
        diet: "carnivore",
        species: "Tyrannosaurus Rex",
      })
      .execute();

    console.log("Deleted T-Rex 'Rexy'");

    console.log("\n✅ Dinosaur entity example completed successfully!");
  } catch (error) {
    console.error("🔥 ERROR:", error);
  }
}

main().then(() => console.log("Shutting down"));
