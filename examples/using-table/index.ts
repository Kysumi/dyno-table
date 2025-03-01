import { and, eq, or } from "../../src/conditions";
import { Table } from "../../src/table";
import { dbClient } from "../db-client";

const table = new Table({
  client: dbClient,
  tableName: "dinosaurs",
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
  },
});

type TDinosaur = {
  pk: string;
  sk: string;
  name: string;
  location: string;
  height?: number;
  weight?: number;
};

const temp = async () => {
  const dino = await table
    .get({
      pk: "type#dinosaur",
      sk: "dinosaurName#Geoff",
    })
    .execute();

  const manyDinosaurs = await table
    .query({
      pk: "type#dinosaur",
      sk: (op) => op.beginsWith("dinosaurName"),
    })
    .execute();

  const complexFilter = and(eq("location", "France"), or(eq("name", "Jeff"), eq("name", "Geoff")));

  const someMoreDinosaurs = await table
    .query<TDinosaur>({
      pk: "type#dinosaur",
    })
    .filter(complexFilter) // Using existing filter contraints
    .execute();

  const newDinoBuddy = await table
    .create<TDinosaur>({
      pk: "123123123",
      sk: "dinosaurName#SomeNewDino",
      name: "Some New Dino",
      location: "France",
      height: 10,
    })
    // Only create if the name does not already exist
    .condition((op) => op.and(op.not(op.attributeExists("name")), op.not(op.attributeExists("sk"))))
    .execute();

  const updatedDino = await table
    .update<TDinosaur>({
      pk: "123123123",
      sk: "dinosaurName#SomeNewDino",
    })
    .set({ name: "Some New Dino 2", location: "Germany" }) // Set multiple attributes at once
    .set("location", "Germany") // Set specific attribute
    .remove("height") // Deletes the attribute from DDB
    // Only update if the attribute exists and the height is greater than 10
    .condition((op) => op.and(op.attributeExists("location"), op.gte("height", 10)))
    .execute();
};
