import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { QueryBuilder } from "../builders";
import { eq } from "../conditions";
import { defineCollection, groupByEntityType } from "../entity/collection";
import type { EntityDefinition } from "../entity/entity";
import type { Table } from "../table";
import type { DynamoItem } from "../types";

interface Dinosaur extends DynamoItem {
  id: string;
  status: string;
}

interface Warehouse extends DynamoItem {
  id: string;
  capacity: number;
}

function entity<T extends DynamoItem>(name: string): EntityDefinition<T> {
  return { name } as EntityDefinition<T>;
}

const DinosaurEntity = entity<Dinosaur>("Dinosaur");
const WarehouseEntity = entity<Warehouse>("Warehouse");
const entities = { Dinosaur: DinosaurEntity, Warehouse: WarehouseEntity };
const mockTable = { query: vi.fn() };

function useRealQueryBuilder(pages: DynamoItem[][]): QueryBuilder<DynamoItem> {
  const builder = new QueryBuilder<DynamoItem>(
    async (_condition, options) => {
      const page = (options.lastEvaluatedKey?.page as number | undefined) ?? 0;
      return {
        items: pages[page] ?? [],
        lastEvaluatedKey: page + 1 < pages.length ? { page: page + 1 } : undefined,
      };
    },
    eq("pk", "LOCATION#NZ"),
  );
  mockTable.query.mockReturnValue(builder);
  return builder;
}

describe("defineCollection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups each query page and drops unmatched entity types", async () => {
    useRealQueryBuilder([
      [
        { id: "dino-1", status: "active", entityType: "Dinosaur" },
        { id: "warehouse-1", capacity: 10, entityType: "Warehouse" },
        { id: "other-1", entityType: "Other" },
      ],
      [],
      [{ id: "dino-2", status: "inactive", entityType: "Dinosaur" }],
    ]);
    const iterator = defineCollection({ entities })
      .createReader(mockTable as unknown as Table)
      .query({ pk: "LOCATION#NZ" })
      .paginate(3);

    const pages = [];
    for await (const page of iterator) pages.push(page);

    expect(pages).toEqual([
      {
        Dinosaur: [{ id: "dino-1", status: "active", entityType: "Dinosaur" }],
        Warehouse: [{ id: "warehouse-1", capacity: 10, entityType: "Warehouse" }],
      },
      {
        Dinosaur: [{ id: "dino-2", status: "inactive", entityType: "Dinosaur" }],
        Warehouse: [],
      },
    ]);
    expect(iterator.getCurrentPage()).toBe(2);
  });

  it("merges all grouped pages", async () => {
    useRealQueryBuilder([
      [{ id: "dino-1", status: "active", entityType: "Dinosaur" }],
      [{ id: "warehouse-1", capacity: 10, entityType: "Warehouse" }],
    ]);

    const grouped = await defineCollection({ entities })
      .createReader(mockTable as unknown as Table)
      .query({ pk: "LOCATION#NZ" })
      .paginate()
      .getAllPages();

    expect(grouped).toEqual({
      Dinosaur: [{ id: "dino-1", status: "active", entityType: "Dinosaur" }],
      Warehouse: [{ id: "warehouse-1", capacity: 10, entityType: "Warehouse" }],
    });
    expectTypeOf(grouped.Dinosaur).toEqualTypeOf<Dinosaur[]>();
    expectTypeOf(grouped.Warehouse).toEqualTypeOf<Warehouse[]>();
  });

  it("returns every configured key for empty input and supports a custom discriminator", async () => {
    expect(groupByEntityType([], entities)).toEqual({ Dinosaur: [], Warehouse: [] });
    useRealQueryBuilder([[{ id: "dino-1", status: "active", kind: "Dinosaur" }]]);

    const grouped = await defineCollection({ entities, entityTypeAttributeName: "kind" })
      .createReader(mockTable as unknown as Table)
      .query({ pk: "LOCATION#NZ" })
      .paginate()
      .getAllPages();

    expect(grouped).toEqual({
      Dinosaur: [{ id: "dino-1", status: "active", kind: "Dinosaur" }],
      Warehouse: [],
    });
  });

  it("returns every configured key for an empty paginator page", async () => {
    useRealQueryBuilder([[]]);
    const pages = [];

    for await (const page of defineCollection({ entities })
      .createReader(mockTable as unknown as Table)
      .query({ pk: "LOCATION#NZ" })
      .paginate()) {
      pages.push(page);
    }

    expect(pages).toEqual([{ Dinosaur: [], Warehouse: [] }]);
  });

  it("gives immediate, grouped, filtered data via execute()/toArray(), same idiom as table.query()", async () => {
    useRealQueryBuilder([
      [
        { id: "dino-1", status: "active", entityType: "Dinosaur" },
        { id: "warehouse-1", capacity: 10, entityType: "Warehouse" },
        { id: "other-1", entityType: "Other" },
      ],
      [{ id: "dino-2", status: "inactive", entityType: "Dinosaur" }],
    ]);

    const iterator = await defineCollection({ entities })
      .createReader(mockTable as unknown as Table)
      .query({ pk: "LOCATION#NZ" })
      .execute();
    const grouped = await iterator.toArray();

    expect(grouped).toEqual({
      Dinosaur: [
        { id: "dino-1", status: "active", entityType: "Dinosaur" },
        { id: "dino-2", status: "inactive", entityType: "Dinosaur" },
      ],
      Warehouse: [{ id: "warehouse-1", capacity: 10, entityType: "Warehouse" }],
    });
    expectTypeOf(grouped.Dinosaur).toEqualTypeOf<Dinosaur[]>();
    expectTypeOf(grouped.Warehouse).toEqualTypeOf<Warehouse[]>();
  });

  it("streams individual filtered items via for-await on execute()'s result", async () => {
    useRealQueryBuilder([
      [
        { id: "dino-1", status: "active", entityType: "Dinosaur" },
        { id: "other-1", entityType: "Other" },
      ],
    ]);

    const iterator = await defineCollection({ entities })
      .createReader(mockTable as unknown as Table)
      .query({ pk: "LOCATION#NZ" })
      .execute();

    const items = [];
    for await (const item of iterator) items.push(item);

    expect(items).toEqual([{ id: "dino-1", status: "active", entityType: "Dinosaur" }]);
    expectTypeOf(items).toEqualTypeOf<(Dinosaur | Warehouse)[]>();
  });

  it("rejects duplicate entity names immediately", () => {
    expect(() =>
      defineCollection({
        entities: { First: DinosaurEntity, Second: entity<Warehouse>("Dinosaur") },
      }),
    ).toThrow('defineCollection: duplicate entity name "Dinosaur"');
  });

  it("keeps normal QueryBuilder chaining and applies the configured index", () => {
    const builder = useRealQueryBuilder([]);
    const useIndex = vi.spyOn(builder, "useIndex");
    const filter = vi.spyOn(builder, "filter");
    const paginate = vi.spyOn(builder, "paginate");
    const sortDescending = vi.spyOn(builder, "sortDescending");

    const query = defineCollection({ entities, indexName: "gsi1" })
      .createReader(mockTable as unknown as Table)
      .query({ pk: "LOCATION#NZ" });

    const iterator = query
      .filter((op) => op.eq("status", "active"))
      .useIndex("gsi2")
      .sortDescending()
      .paginate();

    expect(useIndex).toHaveBeenCalledWith("gsi1");
    expect(useIndex).toHaveBeenCalledWith("gsi2");
    expect(filter).toHaveBeenCalledOnce();
    expect(paginate).toHaveBeenCalledWith(25);
    expect(sortDescending).toHaveBeenCalledOnce();
    expect(iterator).toBeDefined();
  });

  it("leaves the base-table query alone when no index is configured", () => {
    const builder = useRealQueryBuilder([]);
    const useIndex = vi.spyOn(builder, "useIndex");

    defineCollection({ entities })
      .createReader(mockTable as unknown as Table)
      .query({ pk: "LOCATION#NZ" });

    expect(useIndex).not.toHaveBeenCalled();
  });
});
