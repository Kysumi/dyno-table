import { describe, it, expect } from "vitest";
import { Table } from "../table";
import { docClient } from "../../tests/ddb-client";

type Dinosaur = {
  demoPartitionKey: string;
  demoSortKey: string;
  name: string;
  species: string;
  diet: string;
  status?: string;
  health?: number;
  enclosureId?: string;
  lastFed?: string;
  tags?: Set<string>;
};

describe("TransactionBuilder Integration Tests", () => {
  const table = new Table({
    client: docClient,
    tableName: "TestTable",
    indexes: {
      partitionKey: "demoPartitionKey",
      sortKey: "demoSortKey",
    },
  });

  describe("Command-based transaction operations", () => {
    it("should execute a transaction to transfer a dinosaur between enclosures", async () => {
      // Create a dinosaur in the source enclosure
      await table
        .put<Dinosaur>({
          demoPartitionKey: "ENCLOSURE#A",
          demoSortKey: "DINO#001",
          name: "Rex",
          species: "Tyrannosaurus",
          diet: "Carnivore",
          status: "HEALTHY",
          health: 100,
          enclosureId: "A",
          lastFed: new Date().toISOString(),
        })
        .execute();

      // Create the destination enclosure status
      await table
        .put<Dinosaur>({
          demoPartitionKey: "ENCLOSURE#B",
          demoSortKey: "STATUS",
          status: "READY",
          name: "Carnivore Enclosure B",
          species: "ENCLOSURE",
          diet: "N/A",
        })
        .execute();

      const transaction = table.transactionBuilder();

      // Remove dinosaur from source enclosure
      table
        .delete({
          pk: "ENCLOSURE#A",
          sk: "DINO#001",
        })
        .withTransaction(transaction);

      // Check if destination enclosure is ready
      table
        .conditionCheck({
          pk: "ENCLOSURE#B",
          sk: "STATUS",
        })
        .condition((op) => op.and(op.attributeExists("demoPartitionKey"), op.eq("status", "READY")))
        .withTransaction(transaction);

      // Add dinosaur to new enclosure
      table
        .put<Dinosaur>({
          demoPartitionKey: "ENCLOSURE#B",
          demoSortKey: "DINO#001",
          name: "Rex",
          species: "Tyrannosaurus",
          diet: "Carnivore",
          status: "HEALTHY",
          health: 100,
          enclosureId: "B",
          lastFed: new Date().toISOString(),
        })
        .withTransaction(transaction);

      // Execute the transaction
      await transaction.execute();

      // Verify results
      const sourceEnclosure = await table.query<Dinosaur>({ pk: "ENCLOSURE#A" }).execute();
      const destEnclosure = await table.query<Dinosaur>({ pk: "ENCLOSURE#B" }).execute();
      
      const sourceItems = await sourceEnclosure.toArray();
      const destItems = await destEnclosure.toArray();

      // Source enclosure should be empty (except for status)
      expect(sourceItems.filter((item) => item.demoSortKey.startsWith("DINO#"))).toHaveLength(0);

      // Destination enclosure should have the dinosaur
      const transferredDino = destItems.find((item) => item.demoSortKey === "DINO#001");
      expect(transferredDino).toBeDefined();
      expect(transferredDino?.name).toBe("Rex");
      expect(transferredDino?.enclosureId).toBe("B");
    });

    it("should roll back a dinosaur transfer when health check fails", async () => {
      // Create a dinosaur that's not healthy enough for transfer
      await table
        .put<Dinosaur>({
          demoPartitionKey: "ENCLOSURE#C",
          demoSortKey: "DINO#002",
          name: "Veloci",
          species: "Velociraptor",
          diet: "Carnivore",
          status: "INJURED", // Not healthy enough for transfer
          health: 60,
          enclosureId: "C",
          lastFed: new Date().toISOString(),
        })
        .execute();

      // Create the destination quarantine enclosure
      await table
        .put<Dinosaur>({
          demoPartitionKey: "ENCLOSURE#QUARANTINE",
          demoSortKey: "STATUS",
          status: "READY",
          name: "Quarantine Enclosure",
          species: "ENCLOSURE",
          diet: "N/A",
        })
        .execute();

      // Create a transaction
      const transaction = table.transactionBuilder();

      // Try to add entry to quarantine enclosure (this should not succeed)
      const putBuilder = table.put<Dinosaur>({
        demoPartitionKey: "ENCLOSURE#QUARANTINE",
        demoSortKey: "DINO#002",
        name: "Veloci",
        species: "Velociraptor",
        diet: "Carnivore",
        status: "INJURED",
        health: 60,
        enclosureId: "QUARANTINE",
        lastFed: new Date().toISOString(),
      });
      putBuilder.withTransaction(transaction);

      // Add a health check condition that will fail
      const healthCheckBuilder = table.conditionCheck({
        pk: "ENCLOSURE#C",
        sk: "DINO#002",
      });

      healthCheckBuilder
        .condition((op) =>
          op.and(
            op.eq("status", "HEALTHY"), // This will fail because status is "INJURED"
            op.gte("health", 80), // This will fail because health is 60
          ),
        )
        .withTransaction(transaction);

      // Execute the transaction and expect it to fail
      try {
        await transaction.execute();
        // If we get here, the test should fail
        expect(true).toBe(false); // This should not execute
      } catch (error) {
        // Transaction should fail
        expect(error).toBeDefined();
      }

      // Verify that no transfer occurred
      const sourceEnclosure = await table.query<Dinosaur>({ pk: "ENCLOSURE#C" }).execute();
      const quarantineEnclosure = await table.query<Dinosaur>({ pk: "ENCLOSURE#QUARANTINE" }).execute();

      const sourceItems = await sourceEnclosure.toArray();
      const quarantineItems = await quarantineEnclosure.toArray();

      // The dinosaur should still be in the original enclosure
      const originalDino = sourceItems.find((item) => item.demoSortKey === "DINO#002");
      expect(originalDino).toBeDefined();
      expect(originalDino?.status).toBe("INJURED");
      expect(originalDino?.enclosureId).toBe("C");

      // The quarantine enclosure should not have the dinosaur
      const quarantineDino = quarantineItems.find((item) => item.demoSortKey === "DINO#002");
      expect(quarantineDino).toBeUndefined();
    });

    it("should handle complex dinosaur feeding and health monitoring updates in a transaction", async () => {
      // Create a hungry dinosaur with monitoring tags
      await table
        .put<Dinosaur>({
          demoPartitionKey: "ENCLOSURE#D",
          demoSortKey: "DINO#003",
          name: "Spiky",
          species: "Stegosaurus",
          diet: "Herbivore",
          status: "HUNGRY",
          health: 85,
          enclosureId: "D",
          lastFed: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Last fed 24 hours ago
          tags: new Set(["needs_feeding", "routine_check", "herbivore"]),
        })
        .execute();

      // Create a transaction for feeding and health update
      const transaction = table.transactionBuilder();

      table
        .update<Dinosaur>({
          pk: "ENCLOSURE#D",
          sk: "DINO#003",
        })
        .set("status", "HEALTHY")
        .set("lastFed", new Date().toISOString())
        .add("health", 15) // Increase health after feeding
        .deleteElementsFromSet("tags", ["needs_feeding"]) // Remove feeding tag
        .set({
          diet: "Herbivore", // Confirm diet type
          enclosureId: "D", // Maintain enclosure tracking
        })
        .withTransaction(transaction);

      // Execute the transaction
      await transaction.execute();

      const result = await table
        .get<Dinosaur>({
          pk: "ENCLOSURE#D",
          sk: "DINO#003",
        })
        .execute();

      const dino = result.item;
      expect(dino).toBeDefined();
      expect(dino?.health).toBe(100); // 85 + 15
      expect(dino?.status).toBe("HEALTHY");

      // Verify feeding status
      expect(new Date(dino?.lastFed || "").getTime()).toBeGreaterThan(new Date(Date.now() - 60000).getTime()); // Fed within the last minute

      // Check tags - needs_feeding should be removed, other tags retained
      expect(dino?.tags).toBeDefined();
      expect(dino?.tags?.has("needs_feeding")).toBe(false);
      expect(dino?.tags?.has("routine_check")).toBe(true);
      expect(dino?.tags?.has("herbivore")).toBe(true);
    });

    it("should verify multiple safety conditions before adding dinosaur to enclosure", async () => {
      // Create enclosure status and occupancy records
      await Promise.all([
        table
          .put<Dinosaur>({
            demoPartitionKey: "ENCLOSURE#E",
            demoSortKey: "STATUS",
            name: "Herbivore Enclosure E",
            species: "ENCLOSURE",
            diet: "Herbivore",
            status: "ACTIVE",
            tags: new Set(["herbivore_only", "capacity_available"]),
          })
          .execute(),
        table
          .put<Dinosaur>({
            demoPartitionKey: "ENCLOSURE#E",
            demoSortKey: "OCCUPANCY",
            name: "Enclosure E Occupancy",
            species: "ENCLOSURE",
            diet: "N/A",
            status: "AVAILABLE",
            tags: new Set(["max_capacity_4", "current_occupants_2"]),
          })
          .execute(),
      ]);

      // Create a transaction
      const transaction = table.transactionBuilder();

      // Check enclosure status (must be ACTIVE)
      table
        .conditionCheck({
          pk: "ENCLOSURE#E",
          sk: "STATUS",
        })
        .condition((op) => op.and(op.eq("status", "ACTIVE"), op.eq("diet", "Herbivore")))
        .withTransaction(transaction);

      // Check occupancy (must be AVAILABLE)
      table
        .conditionCheck({
          pk: "ENCLOSURE#E",
          sk: "OCCUPANCY",
        })
        .condition((op) =>
          op.and(
            op.eq("status", "AVAILABLE"),
            op.contains("tags", "current_occupants_2"), // Verify current occupancy
          ),
        )
        .withTransaction(transaction);

      // Add new dinosaur if all conditions pass
      const newDino: Dinosaur = {
        demoPartitionKey: "ENCLOSURE#E",
        demoSortKey: "DINO#004",
        name: "Tri",
        species: "Triceratops",
        diet: "Herbivore",
        status: "HEALTHY",
        health: 100,
        enclosureId: "E",
        lastFed: new Date().toISOString(),
        tags: new Set(["herbivore", "new_arrival"]),
      };

      table.put<Dinosaur>(newDino).withTransaction(transaction);

      // Execute the transaction
      await transaction.execute();

      // Verify the new dinosaur was added
      const result = await table
        .get<Dinosaur>({
          pk: "ENCLOSURE#E",
          sk: "DINO#004",
        })
        .execute();

      expect(result.item).toBeDefined();
      expect(result.item?.name).toBe("Tri");
      expect(result.item?.species).toBe("Triceratops");
      expect(result.item?.diet).toBe("Herbivore");
      expect(result.item?.enclosureId).toBe("E");
    });
  });
});
