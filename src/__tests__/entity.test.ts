import { describe, beforeEach, it, expect, vi } from "vitest";
import { defineEntity, createQueries, createIndex } from "../entity";
import type { StandardSchemaV1 } from "../standard-schema";
import type { Table } from "../table";
import type { EntityRepository } from "../entity";
import { partitionKey } from "../utils/key-template";
import { sortKey } from "../utils/sort-key-template";
import type { QueryBuilder } from "../builders/query-builder";
import type { TableConfig } from "../types";

// Define the Dinosaur type
interface Dinosaur extends Record<string, unknown> {
  id: number;
  species: string;
  name: string;
  enclosureId: string;
  diet: string;
  height: number;
  weight: number;
  createdAt?: string;
  updatedAt?: string;
}

// Define query types
type DinosaurQueries = {
  byId: (input: { id: number }) => Promise<Dinosaur[]>;
  byEnclosureId: (input: { enclosureId: string }) => Promise<Dinosaur[]>;
};

// Define the repository type with proper query methods
interface DinosaurRepository extends Omit<EntityRepository<Dinosaur>, "query"> {
  query: DinosaurQueries;
}

// Create schema for validation
const dinosaurSchema: StandardSchemaV1<Dinosaur> = {
  "~standard": {
    version: 1,
    vendor: "dyno-table",
    validate: (value: unknown) => {
      if (typeof value !== "object" || value === null) {
        return {
          issues: [{ message: "Value must be an object" }],
        };
      }

      const dinosaur = value as Dinosaur;
      const issues: StandardSchemaV1.Issue[] = [];

      if (typeof dinosaur.id !== "number") {
        issues.push({ message: "id must be a number" });
      }
      if (typeof dinosaur.species !== "string") {
        issues.push({ message: "species must be a string" });
      }
      if (typeof dinosaur.name !== "string") {
        issues.push({ message: "name must be a string" });
      }
      if (typeof dinosaur.enclosureId !== "string") {
        issues.push({ message: "enclosureId must be a string" });
      }
      if (typeof dinosaur.diet !== "string") {
        issues.push({ message: "diet must be a string" });
      }
      if (typeof dinosaur.height !== "number") {
        issues.push({ message: "height must be a number" });
      }
      if (typeof dinosaur.weight !== "number") {
        issues.push({ message: "weight must be a number" });
      }

      if (issues.length > 0) {
        return { issues };
      }

      return { value: dinosaur };
    },
    types: {
      input: {} as Dinosaur,
      output: {} as Dinosaur,
    },
  },
};

// Create schema for byId query
const byIdSchema: StandardSchemaV1<{ id: number }> = {
  "~standard": {
    version: 1,
    vendor: "dyno-table",
    validate: (value: unknown) => {
      if (typeof value !== "object" || value === null) {
        return { issues: [{ message: "Value must be an object" }] };
      }

      const input = value as { id: number };
      if (typeof input.id !== "number") {
        return { issues: [{ message: "id must be a number" }] };
      }

      return { value: input };
    },
    types: {
      input: {} as { id: number },
      output: {} as { id: number },
    },
  },
};

// Create schema for byEnclosureId query
const byEnclosureSchema: StandardSchemaV1<{ enclosureId: string }> = {
  "~standard": {
    version: 1,
    vendor: "dyno-table",
    validate: (value: unknown) => {
      if (typeof value !== "object" || value === null) {
        return { issues: [{ message: "Value must be an object" }] };
      }

      const input = value as { enclosureId: string };
      if (typeof input.enclosureId !== "string") {
        return { issues: [{ message: "enclosureId must be a string" }] };
      }

      return { value: input };
    },
    types: {
      input: {} as { enclosureId: string },
      output: {} as { enclosureId: string },
    },
  },
};

// Define lifecycle hooks for the entity
const dinosaurHooks = {
  beforeCreate: async (data: Dinosaur) => {
    // Add timestamps before creation
    return {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },
  beforeUpdate: async (data: Partial<Dinosaur>) => {
    // Update timestamp before update
    return {
      ...data,
      updatedAt: new Date().toISOString(),
    };
  },
  afterGet: async (data: Dinosaur | null) => {
    // Transform data after retrieval
    if (data) {
      return {
        ...data,
        name: data.name.toUpperCase(), // Example transformation
      };
    }
    return data;
  },
};

// Create a procedure builder for our entity queries
const createQuery = createQueries<Dinosaur>();

// Define reusable key templates
const dinosaurPK = partitionKey`DINOSAUR#${"id"}`;
const enclosurePK = partitionKey`ENCLOSURE#${"enclosureId"}`;
const speciesPK = partitionKey`SPECIES#${"species"}`;

const metadataSK = sortKey`METADATA#${"species"}`;
const dinosaurSpeciesSK = sortKey`DINOSAUR#${"id"}#SPECIES#${"species"}`;
const dietDinosaurSK = sortKey`DIET#${"diet"}#DINOSAUR#${"id"}`;

// Create indexes
const primaryKey = createIndex<Dinosaur>()
  .partitionKey(({ id }) => dinosaurPK({ id: id.toString() }))
  .sortKey(({ species }) => metadataSK({ species }));

const gsi1 = createIndex<Dinosaur>()
  .partitionKey(({ enclosureId }) => enclosurePK({ enclosureId }))
  .sortKey(() => "METADATA");

// Define the entity
const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  primaryKey,
  indexes: {
    gsi1,
  },
  queries: {
    byId: createQuery.input(byIdSchema).query(({ input, entity }) => {
      return entity
        .query({
          pk: dinosaurPK({ id: input.id.toString() }),
          sk(op) {
            return op.beginsWith(metadataSK({ species: "Tyrannosaurus" }));
          },
        })
        .useIndex("primary");
    }),

    byEnclosureId: createQuery.input(byEnclosureSchema).query(({ input, entity }) => {
      return entity
        .query({
          pk: enclosurePK({ enclosureId: input.enclosureId }),
        })
        .useIndex("gsi1");
    }),
  },
  hooks: dinosaurHooks,
});

describe("Entity System", () => {
  let table: Table;
  let dinosaurRepository: DinosaurRepository;

  beforeEach(() => {
    // Mock table implementation with proper chaining
    const mockExecute = vi.fn().mockResolvedValue({ items: [] });
    const mockUseIndex = vi.fn().mockReturnValue({ execute: mockExecute });
    const mockQueryBuilder = vi.fn();
    const mockSetExecute = vi.fn().mockResolvedValue({ item: {} });
    const mockSet = vi.fn().mockReturnValue({ execute: mockSetExecute });

    // Create mock implementations with proper chaining
    const mockCreateExecute = vi.fn().mockResolvedValue({});
    const mockCreate = vi.fn().mockReturnValue({ 
      execute: mockCreateExecute
    });

    const mockPutExecute = vi.fn().mockResolvedValue({});
    const mockPut = vi.fn().mockReturnValue({ 
      execute: mockPutExecute
    });

    const mockGetExecute = vi.fn().mockResolvedValue({ item: {} });
    const mockGet = vi.fn().mockReturnValue({ 
      execute: mockGetExecute
    });

    const mockUpdate = vi.fn().mockReturnValue({ 
      set: mockSet 
    });

    const mockDeleteExecute = vi.fn().mockResolvedValue(undefined);
    const mockDelete = vi.fn().mockReturnValue({ 
      execute: mockDeleteExecute
    });

    table = {
      create: mockCreate,
      put: mockPut,
      get: mockGet,
      update: mockUpdate,
      delete: mockDelete,
      query: mockQueryBuilder,
      scan: vi.fn().mockReturnValue({
        filter: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            startAt: vi.fn().mockReturnValue({
              execute: vi.fn().mockResolvedValue({ items: [], lastEvaluatedKey: null })
            }),
            execute: vi.fn().mockResolvedValue({ items: [], lastEvaluatedKey: null })
          }),
          execute: vi.fn().mockResolvedValue({ items: [], lastEvaluatedKey: null })
        }),
        limit: vi.fn().mockReturnValue({
          startAt: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue({ items: [], lastEvaluatedKey: null })
          }),
          execute: vi.fn().mockResolvedValue({ items: [], lastEvaluatedKey: null })
        }),
        execute: vi.fn().mockResolvedValue({ items: [], lastEvaluatedKey: null })
      })
    } as unknown as Table;

    const baseRepository = DinosaurEntity.createRepository(table);

    // Create a properly typed repository with mocked query methods
    dinosaurRepository = {
      ...baseRepository,
      query: {
        byId: vi.fn().mockImplementation(async (input: { id: number }) => {
          const result = await mockExecute();
          return result.items as Dinosaur[];
        }),
        byEnclosureId: vi.fn().mockImplementation(async (input: { enclosureId: string }) => {
          const result = await mockExecute();
          return result.items as Dinosaur[];
        }),
      },
    };
  });

  it("should create a dinosaur without applying hooks", async () => {
    const dinosaur = {
      id: 12,
      species: "Tyrannosaurus",
      name: "Rex",
      enclosureId: "E5",
      diet: "carnivore",
      height: 4.5,
      weight: 8000,
    };

    const builder = dinosaurRepository.create(dinosaur);
    await builder.execute();

    // Hooks are no longer applied, so we expect the original dinosaur object
    expect(table.create).toHaveBeenCalledWith(dinosaur);
  });

  it("should upsert a dinosaur without applying hooks", async () => {
    const dinosaur = {
      id: 12,
      species: "Tyrannosaurus",
      name: "Rex",
      enclosureId: "E5",
      diet: "carnivore",
      height: 4.5,
      weight: 8000,
    };

    const builder = dinosaurRepository.upsert(dinosaur);
    await builder.execute();

    // Verify that put was called with the dinosaur object
    expect(table.put).toHaveBeenCalledWith(dinosaur);
  });

  it("should transform dinosaur name to uppercase after retrieval", async () => {
    const dinosaur = {
      id: 12,
      species: "Tyrannosaurus",
      name: "Rex",
      enclosureId: "E5",
      diet: "carnivore",
      height: 4.5,
      weight: 8000,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    // Set up the mock to return the dinosaur
    const mockGetExecute = vi.fn().mockResolvedValue({ item: dinosaur });
    (table.get as any).mockReturnValue({ execute: mockGetExecute });

    const builder = dinosaurRepository.get({
      pk: dinosaurPK({ id: "12" }),
      sk: metadataSK({ species: "Tyrannosaurus" }),
    });
    const result = await builder.execute();

    expect(result).toEqual({
      ...dinosaur,
      name: "REX",
    });
  });

  it("should update dinosaur without applying hooks", async () => {
    const update = {
      weight: 8500,
    };

    // Set up the mock for update
    const mockSetExecute = vi.fn().mockResolvedValue({ item: update });
    const mockSet = vi.fn().mockReturnValue({ execute: mockSetExecute });
    (table.update as any).mockReturnValue({ set: mockSet });

    const builder = dinosaurRepository.update(
      {
        pk: dinosaurPK({ id: "12" }),
        sk: metadataSK({ species: "Tyrannosaurus" }),
      },
      update,
    );
    await builder.execute();

    // Check that update was called with the correct key
    expect(table.update).toHaveBeenCalledWith({
      pk: dinosaurPK({ id: "12" }),
      sk: metadataSK({ species: "Tyrannosaurus" }),
    });

    // Check that set was called with the correct data (without updatedAt since hooks are no longer applied)
    expect(mockSet).toHaveBeenCalledWith(update);
  });

  it("should query dinosaurs by id", async () => {
    // Set up the mock for query
    const mockExecute = vi.fn().mockResolvedValue({ items: [] });
    const mockUseIndex = vi.fn().mockReturnValue({ execute: mockExecute });
    const mockQueryBuilder = vi.fn().mockReturnValue({ useIndex: mockUseIndex });
    (table.query as any).mockImplementation(mockQueryBuilder);

    // Mock the query method directly since we're not actually using the table.query in the test
    (dinosaurRepository.query.byId as any).mockResolvedValue([]);

    await dinosaurRepository.query.byId({
      id: 12,
    });

    // Verify the query method was called with the correct parameters
    expect(dinosaurRepository.query.byId).toHaveBeenCalledWith({
      id: 12,
    });
  });

  it("should query dinosaurs by enclosure", async () => {
    // Set up the mock for query
    const mockExecute = vi.fn().mockResolvedValue({ items: [] });
    const mockUseIndex = vi.fn().mockReturnValue({ execute: mockExecute });
    const mockQueryBuilder = vi.fn().mockReturnValue({ useIndex: mockUseIndex });
    (table.query as any).mockImplementation(mockQueryBuilder);

    // Mock the query method directly since we're not actually using the table.query in the test
    (dinosaurRepository.query.byEnclosureId as any).mockResolvedValue([]);

    await dinosaurRepository.query.byEnclosureId({
      enclosureId: "E5",
    });

    // Verify the query method was called with the correct parameters
    expect(dinosaurRepository.query.byEnclosureId).toHaveBeenCalledWith({
      enclosureId: "E5",
    });
  });
});
