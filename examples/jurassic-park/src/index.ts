import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "dyno-table/table";
import { defineEntity, createQueries, createIndex } from "dyno-table/entity";
import { partitionKey } from "dyno-table/utils/key-template";
import { sortKey } from "dyno-table/utils/sort-key-template";
import { z } from "zod";

// Initialise the DynamoDB client
const docClient = DynamoDBDocument.from(
  new DynamoDBClient({
    region: "us-east-1",
    endpoint: "http://localhost:8000", // Local DynamoDB endpoint
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  }),
);

// Initialize the table with a single-table design schema
const jurassicParkTable = new Table({
  client: docClient,
  tableName: "JurassicPark",
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
    gsis: {
      // GSI for querying by species
      gsi1: {
        partitionKey: "gsi1pk",
        sortKey: "gsi1sk",
      },
      // GSI for querying by enclosure
      gsi2: {
        partitionKey: "gsi2pk",
        sortKey: "gsi2sk",
      },
      // GSI for querying by staff
      gsi3: {
        partitionKey: "gsi3pk",
        sortKey: "gsi3sk",
      },
    },
  },
});

//
// Entity Definitions using Zod
//

// Define the Dinosaur entity with Zod schema
const dinosaurSchema = z.object({
  id: z.string(),
  species: z.string(),
  name: z.string(),
  enclosureId: z.string(),
  diet: z.enum(["carnivore", "herbivore", "omnivore"]),
  dangerLevel: z.number().int().min(1).max(10),
  height: z.number().positive(),
  weight: z.number().positive(),
  status: z.enum(["active", "inactive", "sick", "deceased"]),
  trackingChipId: z.string().optional(),
  lastFed: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Define the type from the schema
type Dinosaur = z.infer<typeof dinosaurSchema>;

// Define the Enclosure entity with Zod schema
const enclosureSchema = z.object({
  id: z.string(),
  name: z.string(),
  capacity: z.number().int().positive(),
  securityLevel: z.number().int().min(1).max(10),
  powerStatus: z.enum(["online", "offline"]),
  lastInspection: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Define the type from the schema
type Enclosure = z.infer<typeof enclosureSchema>;

// Define the Staff entity with Zod schema
const staffSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(["keeper", "vet", "security", "scientist", "admin"]),
  clearanceLevel: z.number().int().min(1).max(10),
  assignedEnclosureIds: z.array(z.string()),
  hireDate: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Define the type from the schema
type Staff = z.infer<typeof staffSchema>;

// Define the Incident entity with Zod schema
const incidentSchema = z.object({
  id: z.string(),
  date: z.string(),
  type: z.enum(["escape", "power-failure", "injury", "illness", "other"]),
  description: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  relatedDinosaurIds: z.array(z.string()).optional(),
  relatedEnclosureIds: z.array(z.string()).optional(),
  relatedStaffIds: z.array(z.string()).optional(),
  status: z.enum(["open", "investigating", "resolved"]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Define the type from the schema
type Incident = z.infer<typeof incidentSchema>;

//
// Define Key Templates
//

// Define reusable key templates for Dinosaur entity
// Primary index keys - optimized for entity retrieval with status and timestamp for sorting
const dinosaurPK = partitionKey`DINOSAUR#${"id"}`;
const dinosaurSK = sortKey`DINOSAUR#STATUS#${"status"}#CREATED#${"createdAt"}`;

// GSI1 keys - optimized for species queries with danger level for filtering and timestamp for sorting
const speciesPK = partitionKey`SPECIES#${"species"}`;
const speciesSK = sortKey`DANGER#${"dangerLevel"}#DINOSAUR#${"id"}#CREATED#${"createdAt"}`;

// GSI2 keys - optimized for enclosure queries with danger level for filtering
const enclosurePK = partitionKey`ENCLOSURE#${"enclosureId"}`;
const enclosureSK = sortKey`DANGER#${"dangerLevel"}#DINOSAUR#${"id"}`;

// GSI3 keys - optimized for diet queries with species grouping and timestamp for sorting
const dietPK = partitionKey`DIET#${"diet"}`;
const dietSK = sortKey`SPECIES#${"species"}#DINOSAUR#${"id"}#CREATED#${"createdAt"}`;

//
// Create Indexes
//

// Create a primary index for Dinosaur entity
const primaryKey = createIndex<Dinosaur>()
  .partitionKey(({ id }: { id: string }) => dinosaurPK({ id }))
  .sortKey(({ status, createdAt }: { status: "active" | "inactive" | "sick" | "deceased"; createdAt?: string }) =>
    dinosaurSK({ status, createdAt }),
  );

// Create GSI1 for querying by species
const gsi1 = createIndex<Dinosaur>()
  .partitionKey(({ species }: { species: string }) => speciesPK({ species }))
  .sortKey(({ id, dangerLevel, createdAt }: { id: string; dangerLevel: number; createdAt?: string }) =>
    speciesSK({
      id,
      dangerLevel: dangerLevel || 1,
      createdAt: createdAt ?? new Date().toISOString(),
    }),
  );

// Create GSI2 for querying by enclosure
const gsi2 = createIndex<Dinosaur>()
  .partitionKey(({ enclosureId }: { enclosureId: string }) => enclosurePK({ enclosureId }))
  .sortKey(({ id, dangerLevel }: { id: string; dangerLevel: number }) =>
    enclosureSK({
      id,
      dangerLevel: dangerLevel || 1,
    }),
  );

// Create GSI3 for querying by diet
const gsi3 = createIndex<Dinosaur>()
  .partitionKey(({ diet }: { diet: string }) => dietPK({ diet }))
  .sortKey(({ id, species, createdAt }: { id: string; species: string; createdAt?: string }) =>
    dietSK({
      id,
      species,
      createdAt: createdAt ?? new Date().toISOString(),
    }),
  );

//
// Define Lifecycle Hooks
//

// Define lifecycle hooks for the Dinosaur entity
const dinosaurHooks = {
  afterGet: async (data: Dinosaur | undefined) => {
    // Transform data after retrieval (example: format dates for display)
    if (data) {
      return {
        ...data,
        // Example transformation: add a formatted date for UI display
        lastFedFormatted: data.lastFed ? new Date(data.lastFed).toLocaleString() : "Never fed",
      };
    }
    return data;
  },
};

//
// Create Query Builders
//

// Create a procedure builder for our entity queries
const createQuery = createQueries<Dinosaur>();

//
// Define the Entity
//

// Define the Dinosaur entity
const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  primaryKey,
  indexes: {
    gsi1,
    gsi2,
    gsi3,
  },
  queries: {
    bySpecies: createQuery
      .input(
        z.object({
          species: z.string(),
        }),
      )
      .query(({ input, entity }) => {
        return entity
          .queryBuilder({
            pk: speciesPK({ species: input.species }),
          })
          .useIndex("gsi1");
      }),

    byEnclosure: createQuery
      .input(
        z.object({
          enclosureId: z.string(),
        }),
      )
      .query(({ input, entity }) => {
        return entity
          .queryBuilder({
            pk: enclosurePK({ enclosureId: input.enclosureId }),
          })
          .useIndex("gsi2");
      }),

    byDiet: createQuery
      .input(
        z.object({
          diet: z.enum(["carnivore", "herbivore", "omnivore"]),
        }),
      )
      .query(({ input, entity }) => {
        return entity
          .queryBuilder({
            pk: dietPK({ diet: input.diet }),
          })
          .useIndex("gsi3");
      }),

    dangerousInEnclosure: createQuery
      .input(
        z.object({
          enclosureId: z.string(),
          minDangerLevel: z.number().int().min(1).max(10),
        }),
      )
      .query(({ input, entity }) => {
        return entity
          .queryBuilder({
            pk: enclosurePK({ enclosureId: input.enclosureId }),
          })
          .useIndex("gsi2")
          .filter((op) => op.gte("dangerLevel", input.minDangerLevel));
      }),
  },
  hooks: dinosaurHooks,
});

//
// Main Example Function
//

async function runJurassicParkExample() {
  console.log("🦖 Welcome to Jurassic Park! 🦖");
  console.log("Initializing dinosaur management system...");

  // Create a repository for the Dinosaur entity
  const dinosaurRepo = DinosaurEntity.createRepository(jurassicParkTable);

  try {
    // Create some dinosaurs
    console.log("\n🧬 Creating dinosaurs...");

    const trex = await dinosaurRepo
      .create({
        id: "dino-001",
        species: "Tyrannosaurus Rex",
        name: "Rexy",
        enclosureId: "enc-001",
        diet: "carnivore",
        dangerLevel: 10,
        height: 5.2,
        weight: 7000,
        status: "active",
        trackingChipId: "TRX-001",
      })
      // Loads the item from DDB after the insert completes (consumes RCU)
      .returnValues("CONSISTENT")
      .execute();

    if (!trex) {
      throw new Error("Failed to create T-Rex");
    }
    console.log(`Created ${trex.name} (${trex.species})`);

    const velociraptor = await dinosaurRepo
      .create({
        id: "dino-002",
        species: "Velociraptor",
        name: "Blue",
        enclosureId: "enc-002",
        diet: "carnivore",
        dangerLevel: 8,
        height: 1.8,
        weight: 100,
        status: "active",
        trackingChipId: "VEL-001",
      })
      .returnValues("ALL_OLD")
      .execute();
    // The velociraptor was already in the database, so we have updated it instead of creating a new one.
    // we know this due to using the returnValues "ALL_OLD" option. which will only return the item that was updated.
    if (velociraptor) {
      console.log(`Upserted ${velociraptor.name} (${velociraptor.species})`);
    }

    await dinosaurRepo
      .create({
        id: "dino-003",
        species: "Triceratops",
        name: "Trixie",
        enclosureId: "enc-003",
        diet: "herbivore",
        dangerLevel: 4,
        height: 3.0,
        weight: 5000,
        status: "active",
        trackingChipId: "TRI-001",
      })
      .execute();
    console.log("Triceratops was created");

    const brachiosaurus = await dinosaurRepo
      .create({
        id: "dino-004",
        species: "Brachiosaurus",
        name: "Brach",
        enclosureId: "enc-004",
        diet: "herbivore",
        dangerLevel: 3,
        height: 13.0,
        weight: 50000,
        status: "active",
        trackingChipId: "BRA-001",
      })
      .execute();
    console.log("Brachiosaurus was created");

    const dilophosaurus = await dinosaurRepo
      .create({
        id: "dino-005",
        species: "Dilophosaurus",
        name: "Spitter",
        enclosureId: "enc-002",
        diet: "carnivore",
        dangerLevel: 7,
        height: 2.1,
        weight: 400,
        status: "active",
        trackingChipId: "DIL-001",
      })
      .execute();
    console.log("Dilophosaurus was created");

    // Retrieve a dinosaur
    console.log("\n🔍 Retrieving a dinosaur...");
    const retrievedDino = await dinosaurRepo
      .get({
        pk: dinosaurPK({ id: "dino-001" }),
        sk: dinosaurSK({ status: "active", createdAt: trex.createdAt || new Date().toISOString() }),
      })
      .execute();
    console.log("Retrieved dinosaur:", retrievedDino.item?.name, `(${retrievedDino.item?.species})`);

    // Update a dinosaur
    console.log("\n✏️ Updating a dinosaur...");
    const updatedDino = await dinosaurRepo
      .update(
        {
          pk: dinosaurPK({ id: "dino-001" }),
          sk: dinosaurSK({ status: "active", createdAt: trex.createdAt || new Date().toISOString() }),
        },
        {
          lastFed: new Date().toISOString(),
          weight: 7200, // Rexy gained some weight!
        },
      )
      .execute();
    console.log(`Updated ${updatedDino.item?.name}'s weight to ${updatedDino.item?.weight}kg and feeding time`);

    // Query dinosaurs by species
    console.log("\n🦖 Querying dinosaurs by species (Velociraptor)...");
    const velociraptors = await dinosaurRepo.query.bySpecies({ species: "Velociraptor" });
    console.log(`Found ${velociraptors.items.length} Velociraptors:`);
    for (const dino of velociraptors.items) {
      console.log(`- ${dino.name} (ID: ${dino.id}, Status: ${dino.status})`);
    }

    // Query dinosaurs by enclosure
    console.log("\n🏞️ Querying dinosaurs in enclosure enc-002...");
    const enclosureDinos = dinosaurRepo.query.byEnclosure({ enclosureId: "enc-002" });
    console.log(`Found ${enclosureDinos.length} dinosaurs in enclosure enc-002:`);
    for (const dino of enclosureDinos) {
      console.log(`- ${dino.name} (${dino.species}, Danger Level: ${dino.dangerLevel})`);
    }

    // Query dinosaurs by diet
    console.log("\n🥩 Querying carnivorous dinosaurs...");
    const carnivores = await dinosaurRepo.query.byDiet({ diet: "carnivore" });
    console.log(`Found ${carnivores.length} carnivorous dinosaurs:`);
    for (const dino of carnivores) {
      console.log(`- ${dino.name} (${dino.species}, Danger Level: ${dino.dangerLevel})`);
    }

    // Query dangerous dinosaurs in an enclosure
    console.log("\n⚠️ Querying dangerous dinosaurs (danger level >= 7) in enclosure enc-002...");
    const dangerousDinos = await dinosaurRepo.query.dangerousInEnclosure({
      enclosureId: "enc-002",
      minDangerLevel: 7,
    });
    console.log(`Found ${dangerousDinos.length} dangerous dinosaurs in enclosure enc-002:`);
    for (const dino of dangerousDinos) {
      console.log(`- ${dino.name} (${dino.species}, Danger Level: ${dino.dangerLevel})`);
    }

    // Demonstrate findBy method
    console.log("\n🔎 Finding dinosaurs by attribute (status = active)...");
    const activeDinos = await dinosaurRepo.findBy("status", "active").execute();
    console.log(`Found ${activeDinos.items.length} active dinosaurs:`);
    for (const dino of activeDinos.items) {
      console.log(`- ${dino.name} (${dino.species})`);
    }

    // Demonstrate scan method with pagination
    console.log("\n📋 Scanning all dinosaurs with pagination (limit: 2)...");
    const scanResult = await dinosaurRepo.scan({ limit: 2 }).execute();
    console.log(`First page: ${scanResult.items.length} dinosaurs`);
    for (const dino of scanResult.items) {
      console.log(`- ${dino.name} (${dino.species})`);
    }

    if (scanResult.hasMore) {
      console.log("There are more dinosaurs to fetch...");
      const secondPage = await dinosaurRepo
        .scan({
          limit: 2,
          lastEvaluatedKey: scanResult.lastEvaluatedKey,
        })
        .execute();
      console.log(`Second page: ${secondPage.items.length} dinosaurs`);
      for (const dino of secondPage.items) {
        console.log(`- ${dino.name} (${dino.species})`);
      }
    }

    console.log("\n❌ Deleting a dinosaur...");
    await dinosaurRepo
      .delete({
        pk: dinosaurPK({ id: "dino-005" }),
        sk: dinosaurSK({ status: "active", createdAt: dilophosaurus.createdAt || new Date().toISOString() }),
      })
      .execute();
    console.log("Deleted Dilophosaurus 'Spitter'");

    console.log("\n✅ Jurassic Park example completed successfully!");
    console.log("Remember: Life, uh... finds a way.");
  } catch (error) {
    console.error("🔥 ERROR:", error);
    console.log("System failure! The dinosaurs are loose!");
  }
}

// Run the example
// Uncomment the line below to execute the example
// runJurassicParkExample();

// Export the entities and repositories for use in other files
export { DinosaurEntity, dinosaurSchema, type Dinosaur, type DinosaurRepository, type DinosaurQueries };
