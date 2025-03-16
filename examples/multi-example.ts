import { ScanCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, type Paginator } from "@aws-sdk/lib-dynamodb";
import { eq, Table, type TableConfig } from "../src";

interface DinoTableConfig extends TableConfig {
  indexes: {
    partitionKey: string;
    sortKey: string;
    gsis: {
      GSI1: {
        partitionKey: string;
        sortKey?: string;
      };
      GSI2: {
        partitionKey: string;
        sortKey?: string;
      };
    };
  };
}

// Create DynamoDB client
const client = new DynamoDBClient({
  region: "us-east-1",
  endpoint: "http://localhost:8897",
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
});

const docClient = DynamoDBDocument.from(client);

// Create table instance with the typed configuration
const dinoTable = new Table<DinoTableConfig>({
  client: docClient,
  tableName: "TestTable",
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
    gsis: {
      GSI1: {
        partitionKey: "GSI1PK",
        sortKey: "GSI1SK",
      },
      GSI2: {
        partitionKey: "GSI2PK",
        sortKey: "GSI2SK",
      },
    },
  },
});

const species = [
  "Tyrannosaurus",
  "Velociraptor",
  "Stegosaurus",
  "Triceratops",
  "Pachycephalosaurus",
  "Brachiosaurus",
  "Apatosaurus",
  "Spinosaurus",
  "Ankylosaurus",
  "Allosaurus",
  "Diplodocus",
  "Parasaurolophus",
  "Carnotaurus",
  "Dilophosaurus",
  "Gallimimus",
  "Iguanodon",
  "Megalosaurus",
  "Oviraptor",
  "Protoceratops",
  "Utahraptor",
  "Deinonychus",
  "Compsognathus",
  "Giganotosaurus",
  "Maiasaura",
  "Edmontosaurus",
  "Archaeopteryx",
  "Therizinosaurus",
  "Kentrosaurus",
  "Dreadnoughtus",
  "Argentinosaurus",
  "Microraptor",
  "Styracosaurus",
  "Chasmosaurus",
  "Corythosaurus",
  "Lambeosaurus",
] as const;

const names = [
  "Geoff",
  "John",
  "Jane",
  "Jim",
  "Jill",
  "Rex",
  "Luna",
  "Max",
  "Ruby",
  "Spike",
  "Nova",
  "Drake",
  "Claw",
  "Fang",
  "Echo",
  "Storm",
  "Blaze",
  "Dash",
  "Rocky",
  "Shadow",
  "Ziggy",
  "Scout",
  "Pepper",
  "Amber",
  "Fossil",
  "Atlas",
  "Sage",
  "Onyx",
  "Phoenix",
  "Titan",
  "Roxy",
  "Zeus",
  "River",
  "Axel",
  "Jasper",
  "Slate",
  "Flint",
  "Bones",
  "Quill",
  "Terra",
  "Ash",
  "Comet",
  "Jade",
  "Orion",
  "Ripley",
  "Talon",
  "Volt",
  "Willow",
  "Yoshi",
  "Zephyr",
] as const;

type DinosaurSpecies = (typeof species)[number];
type DinosaurName = (typeof names)[number];

interface DinosaurKey {
  pk: `SPECIES#${DinosaurSpecies}`;
  sk: `FIRST_NAME#${DinosaurName}#LAST_NAME#${DinosaurName}`;
}

// I need to extend Record<string, unknown> for it to work
interface Dinosaur extends Record<string, unknown> {
  pk: DinosaurKey["pk"];
  sk: DinosaurKey["sk"];
  GSI1PK: "TYPE#DINOSAUR";
  GSI1SK: `AGE#${string}`;
  GSI2PK: `FIRST_NAME#${DinosaurName}#LAST_NAME#${DinosaurName}`;
  GSI2SK: `AGE#${string}`;
  age: number;
  firstName: DinosaurName;
  lastName: DinosaurName;
  species: DinosaurSpecies;
  type: "DINOSAUR";
}

function getRandomElement<T extends readonly unknown[]>(array: T): T[number] {
  return array[Math.floor(Math.random() * array.length)];
}

const isUniquePkSk = (pk: DinosaurKey["pk"], sk: DinosaurKey["sk"], array: DinosaurKey[]) => {
  const existing = array.find((item) => item.pk === pk && item.sk === sk);
  return !existing;
};

/**
 * Query patterns:
 *
 * 1. Get all dinosaurs by species
 * 2. Get all dinosaurs by age (ascending)
 * 3. Get all dinosaurs by age (descending)
 * 4. Get all dinosaurs by name
 * 5. Get all dinosaurs by age and species
 * 6. Get all dinosaurs by age and name
 */
const generateRandomDinosaur = (): Dinosaur => {
  // Pad with leading zeros for lexicographic sorting
  const age = Math.floor(Math.random() * 100);
  const paddedAge = age.toString().padStart(2, "0");
  const firstName = getRandomElement(names);
  const lastName = getRandomElement(names);
  const dinosaurSpecies = getRandomElement(species);

  return {
    pk: `SPECIES#${dinosaurSpecies}`,
    sk: `FIRST_NAME#${firstName}#LAST_NAME#${lastName}`,
    GSI1PK: "TYPE#DINOSAUR",
    GSI1SK: `AGE#${paddedAge}`,
    GSI2PK: `FIRST_NAME#${firstName}#LAST_NAME#${lastName}`,
    GSI2SK: `AGE#${paddedAge}`,
    species: dinosaurSpecies,
    type: "DINOSAUR",
    age,
    firstName,
    lastName,
  };
};

const seedData = async () => {
  console.log("Seeding data...");
  const dinosaurs: Dinosaur[] = [];
  let uniqueAttempts = 0;
  while (dinosaurs.length < 2000) {
    if (uniqueAttempts > 100) {
      throw new Error("Failed to generate unique dinosaurs reduce seed size or add more unique indexes");
    }
    const dinosaur = generateRandomDinosaur();
    if (isUniquePkSk(dinosaur.pk, dinosaur.sk, dinosaurs)) {
      dinosaurs.push(dinosaur);
    } else {
      uniqueAttempts++;
    }
  }
  console.log(`Seeding ${dinosaurs.length} dinosaurs...`);

  await dinoTable.batchWrite(
    dinosaurs.map((dino) => ({
      type: "put",
      item: dino,
    })),
  );
  console.log("Data seeded successfully");
};

const cleanData = async () => {
  console.log("Cleaning data...");

  let dinosKilled = 0;

  const dinosaurs = await dinoTable
    .query<Dinosaur>({
      pk: "TYPE#DINOSAUR",
    })
    .useIndex("GSI1")
    .paginate(50);
  do {
    const page = await dinosaurs.getNextPage();
    dinosKilled += page.items.length;
    await dinoTable.batchWrite(
      page.items.map((dino) => ({
        type: "delete",
        key: {
          pk: dino.pk,
          sk: dino.sk,
        },
      })),
    );
    console.log(`Removed ${dinosKilled} dinosaurs`);
  } while (dinosaurs.hasNextPage());

  console.log("Data cleaned successfully");
};

const getDinosaursByName = async (species: DinosaurSpecies, firstName: DinosaurName, lastName?: DinosaurName) => {
  const dinosaurs = await dinoTable
    .query<Dinosaur>({
      pk: `SPECIES#${species}`,
      sk: (op) =>
        lastName ? op.eq(`FIRST_NAME#${firstName}#LAST_NAME#${lastName}`) : op.beginsWith(`FIRST_NAME#${firstName}`),
    })
    .paginate(50);

  let dinosFound = 0;

  const dinosaursFound: Dinosaur[] = [];

  do {
    const page = await dinosaurs.getNextPage();
    dinosFound += page.items.length;
    console.log(`Found ${dinosFound} ${species} dinosaurs named ${firstName} ${lastName ? lastName : ""}`);
    dinosaursFound.push(...page.items);
  } while (dinosaurs.hasNextPage());

  for (const dinosaur of dinosaursFound) {
    console.log(`👋 Mr. ${dinosaur.firstName} ${dinosaur.lastName}`);
  }
};

const scanData = async () => {
  const dinosaurs = await dinoTable.scan<Dinosaur>().select(["firstName", "lastName"]).limit(50).paginate(10);
  let total = 0;
  do {
    const page = await dinosaurs.getNextPage();
    for (const dinosaur of page.items) {
      console.log(`👋 Mr. ${dinosaur.firstName} ${dinosaur.lastName}`);
    }
    total += page.items.length;
  } while (dinosaurs.hasNextPage());
  console.log(`Scanned ${total} dinosaurs`);
};

seedData();
// cleanData();
// getDinosaursByName("Tyrannosaurus", "Geoff");
// scanData();
