import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIndex, defineEntity } from "../entity/entity";
import { IndexGenerationError } from "../errors";
import type { StandardSchemaV1 } from "../standard-schema";
import type { Table } from "../table";
import type { DynamoItem } from "../types";

interface Dinosaur extends DynamoItem {
  id: string;
  name: string;
  species: string;
  diet: string;
  paleontologistId: string;
  excavationSiteId: string;
}

const dinosaurSchema: StandardSchemaV1<Dinosaur> = {
  "~standard": {
    version: 1,
    vendor: "paleontology",
    validate: vi.fn().mockImplementation((data) => ({
      value: data,
    })) as unknown as (value: unknown) => { value: Dinosaur } | { issues: Array<{ message: string }> },
  },
};

const fossilKeySchema: StandardSchemaV1<{ id: string }> = {
  "~standard": {
    version: 1,
    vendor: "paleontology",
    validate: vi.fn().mockImplementation((data) => ({
      value: data,
    })) as unknown as (value: unknown) => { value: { id: string } } | { issues: Array<{ message: string }> },
  },
};

const mockUpdateExecutor = vi.fn();

const mockTable = {
  _getUpdateExecutor: vi.fn().mockReturnValue(mockUpdateExecutor),
  _getPutExecutor: vi.fn(),
  _getGetExecutor: vi.fn(),
  _getDeleteExecutor: vi.fn(),
  getIndexAttributeNames: vi.fn().mockReturnValue([]),
  tableName: "TestTable",
  partitionKey: "pk",
  sortKey: "sk",
  gsis: {
    "paleontologist-index": {
      partitionKey: "gsi1pk",
      sortKey: "gsi1sk",
    },
    "species-diet-index": {
      partitionKey: "gsi2pk",
      sortKey: "gsi2sk",
    },
    "excavation-site-index": {
      partitionKey: "gsi3pk",
      sortKey: "gsi3sk",
    },
  },
  scan: vi.fn(),
  query: vi.fn(),
};

describe("Dinosaur Index Update Operations", () => {
  describe("index regeneration on fossil updates", () => {
    const dinosaurRepository = defineEntity({
      name: "Dinosaur",
      schema: dinosaurSchema,
      primaryKey: createIndex()
        .input(fossilKeySchema)
        .partitionKey((fossil) => `DINOSAUR#${fossil.id}`)
        .sortKey(() => "FOSSIL"),
      indexes: {
        "paleontologist-index": createIndex()
          .input(dinosaurSchema)
          .partitionKey((dino) => `PALEONTOLOGIST#${dino.paleontologistId}`)
          .sortKey((dino) => `DINOSAUR#${dino.id}`),
        "species-diet-index": createIndex()
          .input(dinosaurSchema)
          .partitionKey((dino) => `SPECIES#${dino.species}`)
          .sortKey((dino) => `DIET#${dino.diet}#${dino.id}`),
        "excavation-site-index": createIndex()
          .input(dinosaurSchema)
          .partitionKey((dino) => `SITE#${dino.excavationSiteId}`)
          .sortKey((dino) => `DINOSAUR#${dino.id}`)
          .readOnly(true),
      },
      queries: {},
    });

    let repository: ReturnType<typeof dinosaurRepository.createRepository>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockUpdateExecutor.mockResolvedValue({ item: undefined });
      mockTable._getUpdateExecutor.mockReturnValue(mockUpdateExecutor);
      repository = dinosaurRepository.createRepository(mockTable as unknown as Table);
    });

    it("should regenerate indexes when relevant fossil attributes are updated", () => {
      const fossilKey = { id: "t-rex-123" };
      const updateData = {
        name: "Tyrannosaurus Regina",
        paleontologistId: "dr-grant-456", // This should trigger paleontologist-index regeneration
        // Not updating species to avoid triggering species-diet-index without diet
      };

      const builder = repository.update(fossilKey, updateData);

      // Verify the key generation on the builder
      const command = builder.toDynamoCommand();
      expect(command.key).toEqual({
        pk: "DINOSAUR#t-rex-123",
        sk: "FOSSIL",
      });

      // Verify the entity type condition
      const { readable } = builder.debug();
      expect(readable.conditionExpression).toBe('entityType = "Dinosaur"');

      // Verify that the update includes both the update data and regenerated indexes
      expect(readable.updateExpression).toContain('name = "Tyrannosaurus Regina"');
      expect(readable.updateExpression).toContain('paleontologistId = "dr-grant-456"');
      expect(readable.updateExpression).toContain('gsi1pk = "PALEONTOLOGIST#dr-grant-456"');
      expect(readable.updateExpression).toContain('gsi1sk = "DINOSAUR#t-rex-123"');

      // Should NOT include species-diet-index keys because species wasn't updated
      expect(readable.updateExpression).not.toContain("gsi2pk");
      expect(readable.updateExpression).not.toContain("gsi2sk");
    });

    it("should not update readOnly excavation site indexes", () => {
      const fossilKey = { id: "triceratops-789" };
      const updateData = {
        name: "Triceratops Maximus",
        excavationSiteId: "badlands-site-001", // Would trigger excavation-site-index, but it's readOnly
      };

      const builder = repository.update(fossilKey, updateData);
      const { readable } = builder.debug();

      // Should include the original update data
      expect(readable.updateExpression).toContain('name = "Triceratops Maximus"');
      expect(readable.updateExpression).toContain('excavationSiteId = "badlands-site-001"');

      // Should NOT include readonly excavation site index keys
      expect(readable.updateExpression).not.toContain("gsi3pk");
      expect(readable.updateExpression).not.toContain("gsi3sk");
    });

    it("should throw error when insufficient data to regenerate species-diet index", () => {
      const fossilKey = { id: "velociraptor-456" };
      // Updating species triggers species-diet-index but diet is missing
      const updateData = {
        species: "Velociraptor mongoliensis",
        paleontologistId: "dr-sattler-789",
      };

      // The error is now thrown at update() call time (eager index build)
      expect(() => repository.update(fossilKey, updateData)).toThrow(IndexGenerationError);
    });

    it("should successfully update when all required attributes are provided", () => {
      const fossilKey = { id: "stegosaurus-321" };
      const updateData = {
        species: "Stegosaurus stenops",
        diet: "herbivore", // Both species and diet provided
        paleontologistId: "dr-malcolm-111",
      };

      const builder = repository.update(fossilKey, updateData);
      const { readable } = builder.debug();

      // Should include regenerated index keys
      expect(readable.updateExpression).toContain('species = "Stegosaurus stenops"');
      expect(readable.updateExpression).toContain('diet = "herbivore"');
      expect(readable.updateExpression).toContain('paleontologistId = "dr-malcolm-111"');
      expect(readable.updateExpression).toContain('gsi1pk = "PALEONTOLOGIST#dr-malcolm-111"');
      expect(readable.updateExpression).toContain('gsi1sk = "DINOSAUR#stegosaurus-321"');
      expect(readable.updateExpression).toContain('gsi2pk = "SPECIES#Stegosaurus stenops"');
      expect(readable.updateExpression).toContain('gsi2sk = "DIET#herbivore#stegosaurus-321"');
    });

    it("should add timestamps to fossil updates without affecting index regeneration", () => {
      // Create a new dinosaur repository with timestamps configured
      const dinosaurWithTimestamps = defineEntity({
        name: "DinosaurWithTimestamps",
        schema: dinosaurSchema,
        primaryKey: createIndex()
          .input(fossilKeySchema)
          .partitionKey((fossil) => `DINOSAUR#${fossil.id}`)
          .sortKey(() => "FOSSIL"),
        indexes: {
          "paleontologist-index": createIndex()
            .input(dinosaurSchema)
            .partitionKey((dino) => `PALEONTOLOGIST#${dino.paleontologistId}`)
            .sortKey((dino) => `DINOSAUR#${dino.id}`),
        },
        queries: {},
        settings: {
          timestamps: {
            updatedAt: {
              format: "ISO",
              attributeName: "lastExaminedAt",
            },
          },
        },
      });

      const repoWithTimestamps = dinosaurWithTimestamps.createRepository(mockTable as unknown as Table);

      const fossilKey = { id: "allosaurus-654" };
      const updateData = {
        paleontologistId: "dr-grant-456",
        name: "Allosaurus fragilis - Updated specimen",
      };

      const builder = repoWithTimestamps.update(fossilKey, updateData);
      const { readable } = builder.debug();

      // Should include the original update data, timestamp, and regenerated index keys
      expect(readable.updateExpression).toContain('paleontologistId = "dr-grant-456"');
      expect(readable.updateExpression).toContain('name = "Allosaurus fragilis - Updated specimen"');
      expect(readable.updateExpression).toContain("lastExaminedAt"); // ISO format timestamp
      expect(readable.updateExpression).toContain('gsi1pk = "PALEONTOLOGIST#dr-grant-456"');
      expect(readable.updateExpression).toContain('gsi1sk = "DINOSAUR#allosaurus-654"');
    });

    it("should handle updates that don't affect any fossil indexes", () => {
      const fossilKey = { id: "brachiosaurus-987" };
      const updateData = {
        name: "Brachiosaurus altithorax - Just updating specimen name",
      };

      const builder = repository.update(fossilKey, updateData);
      const { readable } = builder.debug();

      // Should only include the original update data
      expect(readable.updateExpression).toContain("Brachiosaurus altithorax");

      // Should not include any index keys since no indexes were affected
      expect(readable.updateExpression).not.toContain("gsi1pk");
      expect(readable.updateExpression).not.toContain("gsi1sk");
      expect(readable.updateExpression).not.toContain("gsi2pk");
      expect(readable.updateExpression).not.toContain("gsi2sk");
      expect(readable.updateExpression).not.toContain("gsi3pk");
      expect(readable.updateExpression).not.toContain("gsi3sk");
    });

    it("should never regenerate the primary table index during updates", () => {
      const fossilKey = { id: "diplodocus-555" };
      const updateData = {
        name: "Diplodocus carnegii - Updated specimen",
        species: "Diplodocus carnegii",
        diet: "herbivore",
        paleontologistId: "dr-marsh-999",
        excavationSiteId: "morrison-formation-001",
      };

      const builder = repository.update(fossilKey, updateData);

      // Verify the key generation on the builder
      const command = builder.toDynamoCommand();
      expect(command.key).toEqual({
        pk: "DINOSAUR#diplodocus-555",
        sk: "FOSSIL",
      });

      const { readable } = builder.debug();

      // Should include regenerated GSI keys
      expect(readable.updateExpression).toContain('gsi1pk = "PALEONTOLOGIST#dr-marsh-999"');
      expect(readable.updateExpression).toContain('gsi1sk = "DINOSAUR#diplodocus-555"');
      expect(readable.updateExpression).toContain('gsi2pk = "SPECIES#Diplodocus carnegii"');
      expect(readable.updateExpression).toContain('gsi2sk = "DIET#herbivore#diplodocus-555"');
      // Should NOT include gsi3 keys since excavation-site-index is readOnly
      expect(readable.updateExpression).not.toContain("gsi3pk");

      // Most importantly: primary key attributes should NOT be in the update expression
      expect(readable.updateExpression).not.toContain(" pk ");
      expect(readable.updateExpression).not.toContain(" sk ");
    });

    describe("forceRebuildIndexes option", () => {
      it("should force rebuild a single readOnly index when explicitly requested", () => {
        const fossilKey = { id: "triceratops-789" };
        const updateData = {
          name: "Triceratops Maximus Updated",
          excavationSiteId: "badlands-site-002",
        };

        // Use new options param instead of fluent forceIndexRebuild
        const builder = repository.update(fossilKey, updateData, { forceRebuildIndexes: ["excavation-site-index"] });
        const { readable } = builder.debug();

        // The readonly index keys should be included when forced
        expect(readable.updateExpression).toContain('gsi3pk = "SITE#badlands-site-002"');
        expect(readable.updateExpression).toContain('gsi3sk = "DINOSAUR#triceratops-789"');
      });

      it("should force rebuild multiple readOnly indexes when array is provided", () => {
        const fossilKey = { id: "allosaurus-456" };
        const updateData = {
          name: "Allosaurus Updated",
          excavationSiteId: "site-001",
          paleontologistId: "dr-grant-123",
          species: "Allosaurus fragilis",
          diet: "carnivore",
        };

        const builder = repository.update(fossilKey, updateData, {
          forceRebuildIndexes: ["excavation-site-index"],
        });
        const { raw } = builder.debug();

        // Check attribute names include all GSI keys
        const attrNames = Object.values(raw.expressionAttributeNames ?? {});
        expect(attrNames).toContain("gsi1pk");
        expect(attrNames).toContain("gsi1sk");
        expect(attrNames).toContain("gsi3pk");
        expect(attrNames).toContain("gsi3sk");

        // Check attribute values include the correct GSI values
        const attrValues = Object.values(raw.expressionAttributeValues ?? {});
        expect(attrValues).toContain("PALEONTOLOGIST#dr-grant-123"); // gsi1pk
        expect(attrValues).toContain("DINOSAUR#allosaurus-456"); // gsi1sk / gsi3sk
        expect(attrValues).toContain("SITE#site-001"); // gsi3pk
      });

      it("should throw error for unrecognized index", () => {
        const fossilKey = { id: "triceratops-789" };
        const updateData = { name: "Updated name" };

        // Error thrown at update() call time since index build is eager
        expect(() => repository.update(fossilKey, updateData, { forceRebuildIndexes: ["non-existent-index"] })).toThrow(
          IndexGenerationError,
        );
      });

      it("should throw error when forcing rebuild of index with missing template variables", () => {
        const fossilKey = { id: "velociraptor-456" };
        // Trying to force rebuild species-diet-index but only providing species, not diet
        const updateData = {
          species: "Velociraptor mongoliensis",
          paleontologistId: "dr-sattler-789",
        };

        // Error thrown at update() call time — missing diet for species-diet-index
        expect(() => repository.update(fossilKey, updateData)).toThrow(IndexGenerationError);
      });
    });
  });

  describe("readOnly excavation site index configuration", () => {
    it("should allow creating readOnly excavation site indexes", () => {
      const readOnlyIndex = createIndex()
        .input(dinosaurSchema)
        .partitionKey((dino) => `SITE#${dino.excavationSiteId}`)
        .sortKey((dino) => `DINOSAUR#${dino.id}`)
        .readOnly(true);

      expect(readOnlyIndex.isReadOnly).toBe(true);
    });

    it("should allow creating readOnly indexes without sort key for simple site lookups", () => {
      const readOnlyIndex = createIndex()
        .input(dinosaurSchema)
        .partitionKey((dino) => `SITE#${dino.excavationSiteId}`)
        .withoutSortKey()
        .readOnly(true);

      expect(readOnlyIndex.isReadOnly).toBe(true);
    });

    it("should default readOnly to false for regular paleontologist indexes", () => {
      const normalIndex = createIndex()
        .input(dinosaurSchema)
        .partitionKey((dino) => `PALEONTOLOGIST#${dino.paleontologistId}`)
        .sortKey((dino) => `DINOSAUR#${dino.id}`);

      expect(normalIndex.isReadOnly).toBe(false);
    });
  });
});
