import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { BaseRepository } from "../../src/repository/base-repository";
import { Table } from "../../src/table";
import { dbClient, makeNewTable } from "../db-client";

type TDinosaur = {
  id: string;
  species: string;
  age: number;
  heightMeters: number;
  diet: "carnivore" | "herbivore" | "omnivore";
  eats: { id: string; name: string }[];
  banan: {
    id: string;
    name: string;
  };
  meta: {
    paddock: {
      id: number;
      name: string;
    };
  };
};

const tableIndexes = {
  primary: {
    pkName: "pk",
    skName: "sk",
  },
  GSI1: {
    pkName: "GSI1PK",
    skName: "GSI1SK",
  },
};

class DinosaurRepo extends BaseRepository<TDinosaur, keyof typeof tableIndexes> {
  protected override createPrimaryKey(data: TDinosaur) {
    return {
      pk: `dinosaurId#${data.id}`,
      sk: `species#${data.species}`,
    };
  }

  protected getTypeAttributeName() {
    return "_type";
  }

  protected getType(): string {
    return "dinosaur";
  }

  findAllDinosaursInPaddock(paddockId: string) {
    return this.query({
      pk: `paddock#${paddockId}`,
      sk: { operator: "begins_with", value: "dinosaurId#" },
    }).useIndex("GSI1");
  }
}

async function main() {
  console.log("Starting main");
  // Check if the table exists
  const tableExists = await dbClient.send(new DescribeTableCommand({ TableName: "jurassic-table" })).catch(() => false);
  if (!tableExists) {
    await makeNewTable();
  }

  const table = new Table({
    client: dbClient,
    tableIndexes,
    tableName: "jurassic-table",
  });

  const dinosaurRepo = new DinosaurRepo(table);

  const rex = await dinosaurRepo.findOne({
    pk: "dinosaurId#rex001",
  });
  console.log(rex);
  if (!rex) {
    await dinosaurRepo
      .create({
        id: "rex001",
        species: "Tyrannosaurus",
        age: 25,
        heightMeters: 4.6,
        diet: "carnivore",
        eats: [],
        banan: {
          id: "123",
          name: "banan",
        },
        meta: {
          paddock: {
            id: 1,
            name: "Paddock 1",
          },
        },
      })
      .execute();
  }

  console.log("Finding rex");
  await dinosaurRepo.findOrFail({
    pk: "dinosaurId#rex001",
  });

  console.log("Finding all dinosaurs in paddock");
  // Find all adult dinosaurs in paddock
  await dinosaurRepo
    .findAllDinosaursInPaddock("paddock1")
    .whereLessThan("heightMeters", 6)
    .whereGreaterThan("age", 20)
    .execute();

  // Scan for all juvenile carnivores
  await dinosaurRepo.scan().where("age", "<", 10).where("diet", "=", "carnivore").execute();

  await dinosaurRepo.scan().where("meta.paddock.name", "=", "Paddock 1").execute();

  await dinosaurRepo
    .update(
      { pk: "dinosaurId#rex001", sk: "species#Tyrannosaurus" },
      { eats: [{ id: "velociraptor001", name: "clever girl" }] },
    )
    .set("age", 26)
    .set("meta.paddock", { id: 2, name: "Paddock 2" })
    .execute();

  await dinosaurRepo
    .update({ pk: "dinosaurId#rex001", sk: "species#Tyrannosaurus" }, {})
    .set("meta.paddock.name", "welp")
    .execute();

  console.log(await dinosaurRepo.findOne({ pk: "dinosaurId#rex001", sk: "species#Tyrannosaurus" }));

  await dinosaurRepo
    .update({ pk: "dinosaurId#rex001", sk: "species#Tyrannosaurus" }, {})
    .set("meta.paddock.id", 23)
    .set("meta.paddock.name", "woah dude! sick dinosaur paddock")
    .execute();

  console.log(await dinosaurRepo.findOne({ pk: "dinosaurId#rex001", sk: "species#Tyrannosaurus" }));
}

main();
