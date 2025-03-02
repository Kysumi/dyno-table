import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryBuilder } from "../query-builder";
import { eq } from "../../conditions";

describe("QueryBuilder", () => {
  const mockExecutor = vi.fn();
  const mockKeyCondition = eq("id", "123");

  beforeEach(() => {
    mockExecutor.mockClear();
    mockExecutor.mockResolvedValue({ items: [], lastEvaluatedKey: null });
  });

  it("should initialize with executor and key condition", () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    expect(builder).toBeInstanceOf(QueryBuilder);
  });

  it("should set limit", () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder.limit(10);
    expect(builder.getLimit()).toBe(10);
  });

  it("should set index name", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder.useIndex("myIndex");
    await builder.execute();

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
      expect.objectContaining({
        indexName: "myIndex",
      }),
    );
  });

  it("should set consistent read", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder.consistentRead(true);
    await builder.execute();

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
      expect.objectContaining({
        consistentRead: true,
      }),
    );
  });

  it("should set filter with condition", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    const filterCondition = eq("status", "active");
    builder.filter(filterCondition);
    await builder.execute();

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
      expect.objectContaining({
        filter: filterCondition,
      }),
    );
  });

  it("should set filter with function", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder.filter((op) => op.eq("status", "active"));
    await builder.execute();

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
      expect.objectContaining({
        filter: expect.anything(),
      }),
    );
  });

  it("should select fields", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder.select(["id", "name"]);
    await builder.execute();

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
      expect.objectContaining({
        projection: ["id", "name"],
      }),
    );
  });

  it("should set sort order ascending", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder.sortAscending();
    await builder.execute();

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
      expect.objectContaining({
        scanIndexForward: true,
      }),
    );
  });

  it("should set sort order descending", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder.sortDescending();
    await builder.execute();

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
      expect.objectContaining({
        scanIndexForward: false,
      }),
    );
  });

  it("should create paginator", () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    const paginator = builder.paginate(10);
    expect(paginator).toBeDefined();
  });

  it("should set start key", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    const lastKey = { id: "lastId" };
    builder.startFrom(lastKey);
    await builder.execute();

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
      expect.objectContaining({
        lastEvaluatedKey: lastKey,
      }),
    );
  });

  it("should clone builder with all options", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder
      .limit(10)
      .useIndex("myIndex")
      .consistentRead(true)
      .filter(eq("status", "active"))
      .select(["id", "name"])
      .sortDescending();

    const clone = builder.clone();

    // Execute both builders and verify they produce the same parameters
    await builder.execute();
    const originalCall = mockExecutor.mock.calls[0];

    mockExecutor.mockClear();
    await clone.execute();
    const cloneCall = mockExecutor.mock.calls[0];

    expect(clone).not.toBe(builder);
    expect(cloneCall).toEqual(originalCall);
  });

  it("should execute query with correct parameters", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder.limit(10).useIndex("myIndex");

    mockExecutor.mockResolvedValueOnce({ items: [], lastEvaluatedKey: null });
    await builder.execute();

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
      expect.objectContaining({
        limit: 10,
        indexName: "myIndex",
      }),
    );
  });

  it("should support method chaining", () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    const result = builder
      .limit(10)
      .useIndex("myIndex")
      .consistentRead(true)
      .filter(eq("status", "active"))
      .select(["id", "name"])
      .sortDescending();

    expect(result).toBe(builder);
  });
});
