import { describe, it, expect, vi, beforeEach } from "vitest";
import { ScanBuilder } from "../scan-builder";
import { eq } from "../../conditions";

describe("ScanBuilder", () => {
  const mockExecutor = vi.fn();

  beforeEach(() => {
    mockExecutor.mockClear();
    mockExecutor.mockResolvedValue({ items: [], lastEvaluatedKey: null });
  });

  it("should initialize with executor", () => {
    const builder = new ScanBuilder(mockExecutor);
    expect(builder).toBeInstanceOf(ScanBuilder);
  });

  it("should set limit", () => {
    const builder = new ScanBuilder(mockExecutor);
    builder.limit(10);
    expect(builder.getLimit()).toBe(10);
  });

  it("should set index name", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder.useIndex("myIndex");
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        indexName: "myIndex",
      }),
    );
  });

  it("should set consistent read", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder.consistentRead(true);
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        consistentRead: true,
      }),
    );
  });

  it("should set filter with condition", async () => {
    const builder = new ScanBuilder(mockExecutor);
    const filterCondition = eq("status", "active");
    builder.filter(filterCondition);
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: filterCondition,
      }),
    );
  });

  it("should set filter with function", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder.filter((op) => op.eq("status", "active"));
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.anything(),
      }),
    );
  });

  it("should select fields", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder.select(["id", "name"]);
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        projection: ["id", "name"],
      }),
    );
  });

  it("should add a single field to selection", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder.select("id");
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        projection: ["id"],
      }),
    );
  });

  it("should combine multiple select calls", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder.select("id").select(["name", "email"]);
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        projection: expect.arrayContaining(["id", "name", "email"]),
      }),
    );
  });

  it("should create paginator", () => {
    const builder = new ScanBuilder(mockExecutor);
    const paginator = builder.paginate(10);
    expect(paginator).toBeDefined();
  });

  it("should set start key", async () => {
    const builder = new ScanBuilder(mockExecutor);
    const lastKey = { id: "lastId" };
    builder.startFrom(lastKey);
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        lastEvaluatedKey: lastKey,
      }),
    );
  });

  it("should clone builder with all options", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder.limit(10).useIndex("myIndex").consistentRead(true).filter(eq("status", "active")).select(["id", "name"]);

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

  it("should execute scan with correct parameters", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder.limit(10).useIndex("myIndex");

    mockExecutor.mockResolvedValueOnce({ items: [], lastEvaluatedKey: null });
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
        indexName: "myIndex",
      }),
    );
    expect(resultIterator).toBeDefined();
    expect(typeof resultIterator[Symbol.asyncIterator]).toBe("function");
  });

  it("should support method chaining", () => {
    const builder = new ScanBuilder(mockExecutor);
    const result = builder
      .limit(10)
      .useIndex("myIndex")
      .consistentRead(true)
      .filter(eq("status", "active"))
      .select(["id", "name"]);

    expect(result).toBe(builder);
  });

  it("should handle empty results", async () => {
    const builder = new ScanBuilder(mockExecutor);
    mockExecutor.mockResolvedValueOnce({ items: [] });

    const resultIterator = await builder.execute();
    const items = await resultIterator.toArray();
    expect(items).toEqual([]);
    expect(resultIterator.getLastEvaluatedKey()).toBeUndefined();
  });

  it("should handle results with items", async () => {
    const mockItems = [
      { id: "1", name: "Item 1" },
      { id: "2", name: "Item 2" },
    ];
    const builder = new ScanBuilder(mockExecutor);
    mockExecutor.mockResolvedValueOnce({ items: mockItems });

    const resultIterator = await builder.execute();
    const items = await resultIterator.toArray();

    expect(items).toEqual(mockItems);
  });

  it("should handle results with lastEvaluatedKey", async () => {
    const lastKey = { id: "lastId" };
    const builder = new ScanBuilder(mockExecutor);
    
    // First call returns items with lastEvaluatedKey
    mockExecutor.mockResolvedValueOnce({
      items: [{ id: "1" }],
      lastEvaluatedKey: lastKey,
    });
    
    // Second call returns empty results (no more pages)
    mockExecutor.mockResolvedValueOnce({
      items: [],
      lastEvaluatedKey: null,
    });

    const resultIterator = await builder.execute();
    const items = await resultIterator.toArray();

    expect(items).toEqual([{ id: "1" }]);
    expect(resultIterator.getLastEvaluatedKey()).toEqual(lastKey);
  });
});
