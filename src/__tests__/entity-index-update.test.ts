import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { defineEntity, createIndex } from "../entity/entity";
import type { Table } from "../table";
import { eq } from "../conditions";
import type { DynamoItem } from "../types";
import type { StandardSchemaV1 } from "../standard-schema";

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

const mockTable = {
  create: vi.fn(),
  put: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  scan: vi.fn(),
  query: vi.fn(),
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
      // Reset all mocks
      vi.clearAllMocks();

      // Create repository instance
      repository = dinosaurRepository.createRepository(mockTable as unknown as Table);
    });

    it("should regenerate indexes when relevant fossil attributes are updated", async () => {
      const fossilKey = { id: "t-rex-123" };
      const updateData = {
        name: "Tyrannosaurus Regina",
        paleontologistId: "dr-grant-456", // This should trigger paleontologist-index regeneration
        // Not updating species to avoid triggering species-diet-index without diet
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...fossilKey, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      await repository.update(fossilKey, updateData).execute();

      // Verify that the update was called with the correct primary key
      expect(mockTable.update).toHaveBeenCalledWith({
        pk: "DINOSAUR#t-rex-123",
        sk: "FOSSIL",
      });

      // Verify that the entity type condition was added
      expect(mockBuilder.condition).toHaveBeenCalledWith(eq("entityType", "Dinosaur"));

      // Verify that the set method was called with both the update data and regenerated indexes
      expect(mockBuilder.set).toHaveBeenCalledOnce();
      expect(mockBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Tyrannosaurus Regina",
          paleontologistId: "dr-grant-456",
          gsi1pk: "PALEONTOLOGIST#dr-grant-456",
          gsi1sk: "DINOSAUR#t-rex-123",
        }),
      );

      // Should NOT include species-diet-index keys because species wasn't updated
      expect(mockBuilder.set).not.toHaveBeenCalledWith(
        expect.objectContaining({
          gsi2pk: expect.anything(),
          gsi2sk: expect.anything(),
        }),
      );
    });

    it("should not update readOnly excavation site indexes", async () => {
      const fossilKey = { id: "triceratops-789" };
      const updateData = {
        name: "Triceratops Maximus",
        excavationSiteId: "badlands-site-001", // This would normally trigger excavation-site-index, but should be ignored
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...fossilKey, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      await repository.update(fossilKey, updateData).execute();

      // Verify that the set method was called
      expect(mockBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Triceratops Maximus",
          excavationSiteId: "badlands-site-001",
        }),
      );

      // Should NOT include readonly excavation site index keys
      expect(mockBuilder.set).not.toHaveBeenCalledWith(
        expect.objectContaining({
          gsi3pk: expect.anything(),
          gsi3sk: expect.anything(),
        }),
      );
    });

    it("should throw error when insufficient data to regenerate species-diet index", async () => {
      const fossilKey = { id: "velociraptor-456" };
      // Updating species and paleontologistId - species should trigger species-diet-index but diet is missing
      // paleontologistId should trigger paleontologist-index and succeed
      const updateData = {
        species: "Velociraptor mongoliensis", // This will trigger species-diet-index error
        paleontologistId: "dr-sattler-789", // This should work fine
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...fossilKey, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      // This should throw an error because we can't regenerate the species-diet-index
      // without both species and diet
      expect(() => repository.update(fossilKey, updateData)).toThrowError(
        /Cannot update entity: insufficient data to regenerate index.*species-diet-index/,
      );
    });

    it("should successfully update when all required attributes are provided", async () => {
      const fossilKey = { id: "stegosaurus-321" };
      const updateData = {
        species: "Stegosaurus stenops",
        diet: "herbivore", // Now providing both species and diet
        paleontologistId: "dr-malcolm-111",
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...fossilKey, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      await repository.update(fossilKey, updateData).execute();

      // Should include regenerated index keys
      expect(mockBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          species: "Stegosaurus stenops",
          diet: "herbivore",
          paleontologistId: "dr-malcolm-111",
          gsi1pk: "PALEONTOLOGIST#dr-malcolm-111",
          gsi1sk: "DINOSAUR#stegosaurus-321",
          gsi2pk: "SPECIES#Stegosaurus stenops",
          gsi2sk: "DIET#herbivore#stegosaurus-321",
        }),
      );
    });

    it("should add timestamps to fossil updates without affecting index regeneration", async () => {
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

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...fossilKey, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      await repoWithTimestamps.update(fossilKey, updateData).execute();

      // Should include the original update data, timestamp, and regenerated index keys
      expect(mockBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          paleontologistId: "dr-grant-456",
          name: "Allosaurus fragilis - Updated specimen",
          lastExaminedAt: expect.any(String), // ISO format
          gsi1pk: "PALEONTOLOGIST#dr-grant-456",
          gsi1sk: "DINOSAUR#allosaurus-654",
        }),
      );
    });

    it("should handle updates that don't affect any fossil indexes", async () => {
      const fossilKey = { id: "brachiosaurus-987" };
      const updateData = {
        name: "Brachiosaurus altithorax - Just updating specimen name", // This doesn't affect any index
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...fossilKey, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      await repository.update(fossilKey, updateData).execute();

      // Should only include the original update data
      expect(mockBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Brachiosaurus altithorax - Just updating specimen name",
        }),
      );

      // Should not include any index keys since no indexes were affected
      expect(mockBuilder.set).not.toHaveBeenCalledWith(
        expect.objectContaining({
          gsi1pk: expect.anything(),
          gsi1sk: expect.anything(),
          gsi2pk: expect.anything(),
          gsi2sk: expect.anything(),
          gsi3pk: expect.anything(),
          gsi3sk: expect.anything(),
        }),
      );
    });

    it("should never regenerate the primary table index during updates", async () => {
      const fossilKey = { id: "diplodocus-555" };
      const updateData = {
        name: "Diplodocus carnegii - Updated specimen",
        species: "Diplodocus carnegii",
        diet: "herbivore",
        paleontologistId: "dr-marsh-999",
        excavationSiteId: "morrison-formation-001",
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...fossilKey, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      await repository.update(fossilKey, updateData).execute();

      // Verify that the update was called with the correct primary key (generated from input key)
      expect(mockTable.update).toHaveBeenCalledWith({
        pk: "DINOSAUR#diplodocus-555",
        sk: "FOSSIL",
      });

      // Verify that the set method was called with update data and GSI regenerations
      expect(mockBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Diplodocus carnegii - Updated specimen",
          species: "Diplodocus carnegii",
          diet: "herbivore",
          paleontologistId: "dr-marsh-999",
          excavationSiteId: "morrison-formation-001",
          // Should include regenerated GSI keys
          gsi1pk: "PALEONTOLOGIST#dr-marsh-999",
          gsi1sk: "DINOSAUR#diplodocus-555",
          gsi2pk: "SPECIES#Diplodocus carnegii",
          gsi2sk: "DIET#herbivore#diplodocus-555",
          // Should NOT include gsi3 keys since excavation-site-index is readOnly
        }),
      );

      // Most importantly: verify that primary table keys (pk, sk) are NEVER in the set call
      // The primary key should only be used to identify the item to update, never to regenerate it
      expect(mockBuilder.set).not.toHaveBeenCalledWith(
        expect.objectContaining({
          pk: expect.anything(),
          sk: expect.anything(),
        }),
      );
    });
  });

  describe("readOnly excavation site index configuration", () => {
    it("should allow creating readOnly excavation site indexes", () => {
      const readOnlyIndex = createIndex()
        .input(dinosaurSchema)
        .partitionKey((dino) => `SITE#${dino.excavationSiteId}`)
        .sortKey((dino) => `DINOSAUR#${dino.id}`)
        .readOnly(true);

      expect(readOnlyIndex._isReadOnly).toBe(true);
    });

    it("should allow creating readOnly indexes without sort key for simple site lookups", () => {
      const readOnlyIndex = createIndex()
        .input(dinosaurSchema)
        .partitionKey((dino) => `SITE#${dino.excavationSiteId}`)
        .withoutSortKey()
        .readOnly(true);

      expect(readOnlyIndex._isReadOnly).toBe(true);
    });

    it("should default readOnly to false for regular paleontologist indexes", () => {
      const normalIndex = createIndex()
        .input(dinosaurSchema)
        .partitionKey((dino) => `PALEONTOLOGIST#${dino.paleontologistId}`)
        .sortKey((dino) => `DINOSAUR#${dino.id}`);

      // The index builder returns an object with both the readOnly property and a readOnly method
      // We need to check the internal _isReadOnly property for the actual boolean value

      // Check the internal _isReadOnly property which should default to false
      expect(normalIndex._isReadOnly).toBe(false);
    });
  });
});
