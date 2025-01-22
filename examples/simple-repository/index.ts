import { BaseRepository } from "../../src/repository/base-repository";
import { Table } from "../../src/table";
import { dbClient } from "../db-client";

type TDinosaur = {
  id: string;
  species: string;
  age: number;
  heightMeters: number;
  diet: "carnivore" | "herbivore" | "omnivore";
};

const tableIndexes = {
  primary: {
    pkName: "pk",
    skName: "sk",
  },
  gsi1: {
    pkName: "gsi1pk",
    skName: "gsi1sk",
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
    }).useIndex("gsi1");
  }
}

const table = new Table({
  client: dbClient,
  tableIndexes,
  tableName: "jurassic-table",
});

const dinosaurRepo = new DinosaurRepo(table);

dinosaurRepo
  .create({
    id: "rex001",
    species: "Tyrannosaurus",
    age: 25,
    heightMeters: 4.6,
    diet: "carnivore",
  })
  .execute();

dinosaurRepo.findOrFail({
  pk: "dinosaurId#rex001",
});

// Find all adult dinosaurs in paddock
dinosaurRepo
  .findAllDinosaursInPaddock("paddock1")
  .whereLessThan("heightMeters", 6)
  .whereGreaterThan("age", 20)
  .execute();

// Scan for all juvenile carnivores
dinosaurRepo.scan().where("age", "<", 10).where("diet", "=", "carnivore").execute();
