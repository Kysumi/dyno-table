import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Table } from "../table";
import { docClient } from "../../tests/ddb-client";

type Dinosaur = {
  pk: string;
  sk: string;
  name: string;
  type: string;
  height?: number;
  weight?: number;
  diet?: string;
  period?: string;
  discovered?: number;
  tags?: string[];
};

describe("Table Integration Tests", () => {
  let table: Table;

  beforeAll(async () => {
    table = new Table(docClient, {
      name: "TestTable",
      partitionKey: "pk",
      sortKey: "sk",
    });
  });

  describe("Create Items", () => {
    it("should create a new item", async () => {
      const dino: Dinosaur = {
        pk: "dinosaur#1",
        sk: "dino#trex",
        name: "T-Rex",
        type: "Tyrannosaurus",
        height: 20,
        weight: 7000,
        diet: "Carnivore",
        period: "Late Cretaceous",
      };

      const result = await table.create(dino).execute();
      expect(result).toEqual(dino);

      // Verify item was created
      const queryResult = await table.query({ pk: "dinosaur#1" }).execute();
      expect(queryResult.items).toHaveLength(1);
      expect(queryResult.items[0]).toEqual(dino);
    });

    it("should fail to create an item that already exists", async () => {
      const dino: Dinosaur = {
        pk: "dinosaur#2",
        sk: "dino#raptor",
        name: "Velociraptor",
        type: "Dromaeosaurid",
      };

      // Create the item first
      await table.create(dino).execute();

      // Try to create it again
      await expect(table.create(dino).execute()).rejects.toThrow();
    });
  });

  describe("Put Items", () => {
    it("should put an item with no conditions", async () => {
      const dino: Dinosaur = {
        pk: "dinosaur#3",
        sk: "dino#stego",
        name: "Stegosaurus",
        type: "Stegosaurid",
        period: "Late Jurassic",
      };

      const result = await table.put(dino).execute();
      expect(result).toEqual(dino);

      // Verify item was created
      const queryResult = await table.query({ pk: "dinosaur#3" }).execute();
      expect(queryResult.items).toHaveLength(1);
      expect(queryResult.items[0]).toEqual(dino);
    });

    it("should put an item with a condition that passes", async () => {
      // First create an item
      const dino: Dinosaur = {
        pk: "dinosaur#4",
        sk: "dino#brach",
        name: "Brachiosaurus",
        type: "Sauropod",
      };
      await table.put(dino).execute();

      // Update with a condition that should pass
      const updatedDino = {
        ...dino,
        height: 50,
        weight: 80000,
      };

      const result = await table
        .put(updatedDino)
        .condition((op) => op.eq("name", "Brachiosaurus"))
        .execute();

      expect(result).toEqual(updatedDino);
    });

    it("should fail to put an item with a condition that fails", async () => {
      // First create an item
      const dino: Dinosaur = {
        pk: "dinosaur#5",
        sk: "dino#anky",
        name: "Ankylosaurus",
        type: "Ankylosaur",
      };
      await table.put(dino).execute();

      // Update with a condition that should fail
      const updatedDino = {
        ...dino,
        name: "Updated Ankylosaurus",
      };

      await expect(
        table
          .put(updatedDino)
          .condition((op) => op.eq("name", "WrongName"))
          .execute(),
      ).rejects.toThrow();
    });
  });

  describe("Query Items", () => {
    beforeEach(async () => {
      // Create test data
      const dinos: Dinosaur[] = [
        {
          pk: "dinosaur#group1",
          sk: "dino#trex1",
          name: "T-Rex 1",
          type: "Tyrannosaurus",
          period: "Late Cretaceous",
          diet: "Carnivore",
          height: 20,
          weight: 7000,
        },
        {
          pk: "dinosaur#group1",
          sk: "dino#trex2",
          name: "T-Rex 2",
          type: "Tyrannosaurus",
          period: "Late Cretaceous",
          diet: "Carnivore",
          height: 18,
          weight: 6500,
        },
        {
          pk: "dinosaur#group1",
          sk: "dino#raptor1",
          name: "Velociraptor 1",
          type: "Dromaeosaurid",
          period: "Late Cretaceous",
          diet: "Carnivore",
          height: 2,
          weight: 15,
        },
        {
          pk: "dinosaur#group2",
          sk: "dino#stego1",
          name: "Stegosaurus 1",
          type: "Stegosaurid",
          period: "Late Jurassic",
          diet: "Herbivore",
          height: 9,
          weight: 5000,
        },
        {
          pk: "dinosaur#group2",
          sk: "dino#brach1",
          name: "Brachiosaurus 1",
          type: "Sauropod",
          period: "Late Jurassic",
          diet: "Herbivore",
          height: 50,
          weight: 80000,
        },
      ];

      const createPromises = dinos.map((dino) => table.put(dino).execute());
      await Promise.all(createPromises);
    });

    it("should query items by partition key", async () => {
      const result = await table.query({ pk: "dinosaur#group1" }).execute();

      expect(result.items).toHaveLength(3);
      expect(result.items.map((item) => item.sk)).toEqual(
        expect.arrayContaining(["dino#trex1", "dino#trex2", "dino#raptor1"]),
      );
    });

    it("should query items with sort key condition", async () => {
      const result = await table
        .query({
          pk: "dinosaur#group1",
          sk: (op) => op.beginsWith("dino#trex"),
        })
        .execute();

      expect(result.items).toHaveLength(2);
      expect(result.items.map((item) => item.name)).toEqual(expect.arrayContaining(["T-Rex 1", "T-Rex 2"]));
    });

    it("should query items with filter", async () => {
      const result = await table
        .query({ pk: "dinosaur#group1" })
        .filter((op) => op.gt("height", 15))
        .execute();

      expect(result.items).toHaveLength(2);
      expect(result.items.map((item) => item.name)).toEqual(expect.arrayContaining(["T-Rex 1", "T-Rex 2"]));
    });

    it("should query items with limit", async () => {
      const result = await table.query({ pk: "dinosaur#group1" }).limit(2).execute();

      expect(result.items).toHaveLength(2);
    });

    it("should query items with sort order", async () => {
      const ascResult = await table.query({ pk: "dinosaur#group1" }).sortAscending().execute();

      const descResult = await table.query({ pk: "dinosaur#group1" }).sortDescending().execute();

      expect(ascResult.items.map((item) => item.sk)).toEqual(["dino#raptor1", "dino#trex1", "dino#trex2"]);

      expect(descResult.items.map((item) => item.sk)).toEqual(["dino#trex2", "dino#trex1", "dino#raptor1"]);
    });

    it("should query items with projection", async () => {
      const result = await table.query({ pk: "dinosaur#group1" }).select(["name", "type"]).execute();

      expect(result.items).toHaveLength(3);
      expect(Object.keys(result.items[0])).toContain("name");
      expect(Object.keys(result.items[0])).toContain("type");
      expect(Object.keys(result.items[0])).not.toContain("height");
      expect(Object.keys(result.items[0])).not.toContain("weight");
    });

    it("should query items with complex filter conditions", async () => {
      const result = await table
        .query({ pk: "dinosaur#group1" })
        .filter((op) => op.and(op.eq("type", "Tyrannosaurus"), op.gt("weight", 6000)))
        .execute();

      expect(result.items).toHaveLength(2);
      expect(result.items.map((item) => item.name)).toEqual(expect.arrayContaining(["T-Rex 1", "T-Rex 2"]));
    });
  });

  describe("Get Items", () => {
    beforeEach(async () => {
      // Create a test item
      const dino: Dinosaur = {
        pk: "dinosaur#get",
        sk: "dino#test",
        name: "Test Dino",
        type: "TestType",
        tags: ["test", "get"],
      };
      await table.put(dino).execute();
    });

    it("should get an item by key", async () => {
      const result = await table.get({ pk: "dinosaur#get", sk: "dino#test" }).execute();

      expect(result.item).toBeDefined();
      expect(result.item?.name).toBe("Test Dino");
      expect(result.item?.type).toBe("TestType");
    });

    it("should return undefined for non-existent item", async () => {
      const result = await table.get({ pk: "dinosaur#get", sk: "dino#nonexistent" }).execute();

      expect(result.item).toBeUndefined();
    });
  });

  describe("Delete Items", () => {
    beforeEach(async () => {
      // Create a test item
      const dino: Dinosaur = {
        pk: "dinosaur#delete",
        sk: "dino#test",
        name: "Delete Test",
        type: "DeleteType",
      };
      await table.put(dino).execute();
    });

    it("should delete an item by key", async () => {
      await table.delete({ pk: "dinosaur#delete", sk: "dino#test" }).execute();

      // Verify item was deleted
      const result = await table.get({ pk: "dinosaur#delete", sk: "dino#test" }).execute();
      expect(result.item).toBeUndefined();
    });

    it("should delete with a condition that passes", async () => {
      await table
        .delete({ pk: "dinosaur#delete", sk: "dino#test" })
        .condition((op) => op.eq("name", "Delete Test"))
        .execute();

      // Verify item was deleted
      const result = await table.get({ pk: "dinosaur#delete", sk: "dino#test" }).execute();
      expect(result.item).toBeUndefined();
    });

    it("should fail to delete with a condition that fails", async () => {
      await expect(
        table
          .delete({ pk: "dinosaur#delete", sk: "dino#test" })
          .condition((op) => op.eq("name", "Wrong Name"))
          .execute(),
      ).rejects.toThrow();

      // Verify item still exists
      const result = await table.get({ pk: "dinosaur#delete", sk: "dino#test" }).execute();
      expect(result.item).toBeDefined();
    });
  });

  describe("Update Items", () => {
    beforeEach(async () => {
      // Create a test item
      const dino: Dinosaur = {
        pk: "dinosaur#update",
        sk: "dino#test",
        name: "Update Test",
        type: "UpdateType",
        height: 10,
        weight: 1000,
      };
      await table.put(dino).execute();
    });

    it("should update specific attributes", async () => {
      const result = await table
        .update({ pk: "dinosaur#update", sk: "dino#test" })
        .set("name", "Updated Name")
        .set("height", 15)
        .execute();

      expect(result.item).toBeDefined();
      expect(result.item?.name).toBe("Updated Name");
      expect(result.item?.height).toBe(15);
      expect(result.item?.type).toBe("UpdateType"); // Unchanged
      expect(result.item?.weight).toBe(1000); // Unchanged
    });

    it("should update with add operation", async () => {
      const result = await table.update({ pk: "dinosaur#update", sk: "dino#test" }).add("weight", 500).execute();

      expect(result.item?.weight).toBe(1500);
    });

    it("should update with remove operation", async () => {
      const result = await table.update({ pk: "dinosaur#update", sk: "dino#test" }).remove("height").execute();

      expect(result.item?.height).toBeUndefined();
    });

    it("should update with a condition that passes", async () => {
      const result = await table
        .update({ pk: "dinosaur#update", sk: "dino#test" })
        .set("name", "Condition Passed")
        .condition((op) => op.eq("type", "UpdateType"))
        .execute();

      expect(result.item?.name).toBe("Condition Passed");
    });

    it("should fail to update with a condition that fails", async () => {
      await expect(
        table
          .update({ pk: "dinosaur#update", sk: "dino#test" })
          .set("name", "Should Not Update")
          .condition((op) => op.eq("type", "WrongType"))
          .execute(),
      ).rejects.toThrow();

      // Verify item wasn't updated
      const getResult = await table.get({ pk: "dinosaur#update", sk: "dino#test" }).execute();
      expect(getResult.item?.name).toBe("Update Test");
    });

    it("should perform multiple operations in one update", async () => {
      const result = await table
        .update({ pk: "dinosaur#update", sk: "dino#test" })
        .set("name", "Multi Update")
        .add("weight", 200)
        .remove("height")
        .execute();

      expect(result.item?.name).toBe("Multi Update");
      expect(result.item?.weight).toBe(1200);
      expect(result.item?.height).toBeUndefined();
    });
  });

  describe("Entity Operations", () => {
    it("should create and use an entity", async () => {
      const dinoEntity = table.entity<Dinosaur>({
        discriminator: "dinosaur",
        timestamps: true,
      });

      // Create an item through the entity
      const dino = await dinoEntity.create({
        pk: "dinosaur#entity",
        sk: "dino#test",
        name: "Entity Test",
        type: "EntityType",
      });

      expect(dino.__type).toBe("dinosaur");
      expect(dino.createdAt).toBeDefined();
      expect(dino.updatedAt).toBeDefined();

      // Get the item
      const getDino = await dinoEntity.get("dinosaur#entity", "dino#test");
      expect(getDino).toBeDefined();
      expect(getDino?.name).toBe("Entity Test");

      // Update the item
      const updatedDino = await dinoEntity.update("dinosaur#entity", "dino#test", { name: "Updated Entity" });

      expect(updatedDino.name).toBe("Updated Entity");
      expect(updatedDino.updatedAt).not.toBe(dino.updatedAt);

      // Delete the item
      await dinoEntity.delete("dinosaur#entity", "dino#test");

      // Verify deletion
      const deletedDino = await dinoEntity.get("dinosaur#entity", "dino#test");
      expect(deletedDino).toBeNull();
    });
  });
});
