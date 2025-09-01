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

  it("should chain two filters with AND", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder
      .filter((op) => op.eq("status", "active"))
      .filter((op) => op.eq("type", "test"));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          type: "and",
          conditions: [
            { type: "eq", attr: "status", value: "active" },
            { type: "eq", attr: "type", value: "test" },
          ],
        },
      }),
    );
  });

  it("should chain three filters with AND", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder
      .filter((op) => op.eq("status", "active"))
      .filter((op) => op.eq("type", "test"))
      .filter((op) => op.eq("name", "test"));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          type: "and",
          conditions: [
            { type: "eq", attr: "status", value: "active" },
            { type: "eq", attr: "type", value: "test" },
            { type: "eq", attr: "name", value: "test" },
          ],
        },
      }),
    );
  });

  it("should chain a mix of AND and OR filters", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder
      .filter((op) => op.eq("status", "active"))
      .filter((op) => op.or(op.eq("type", "test"), op.eq("type", "test2")));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          type: "and",
          conditions: [
            { type: "eq", attr: "status", value: "active" },
            {
              type: "or",
              conditions: [
                { type: "eq", attr: "type", value: "test" },
                { type: "eq", attr: "type", value: "test2" },
              ],
            },
          ],
        },
      }),
    );
  });

  it("should handle complex nested filter combinations", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder
      .filter((op) => op.eq("status", "active"))
      .filter((op) => op.or(op.eq("type", "test"), op.eq("type", "test2")))
      .filter((op) => op.gt("createdAt", "2023-01-01"))
      .filter((op) => op.and(op.lt("score", 100), op.ne("category", "deleted")));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          type: "and",
          conditions: [
            { type: "eq", attr: "status", value: "active" },
            {
              type: "or",
              conditions: [
                { type: "eq", attr: "type", value: "test" },
                { type: "eq", attr: "type", value: "test2" },
              ],
            },
            { type: "gt", attr: "createdAt", value: "2023-01-01" },
            {
              type: "and",
              conditions: [
                { type: "lt", attr: "score", value: 100 },
                { type: "ne", attr: "category", value: "deleted" },
              ],
            },
          ],
        },
      }),
    );
  });

  it("should handle filter chaining with existing AND condition", async () => {
    const builder = new ScanBuilder(mockExecutor);
    
    // First add a complex filter that creates an AND condition
    builder.filter((op) => op.and(op.eq("status", "active"), op.eq("type", "test")));
    
    // Then add more filters that should be appended to the existing AND
    builder.filter((op) => op.gt("createdAt", "2023-01-01"));
    builder.filter((op) => op.lt("score", 100));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          type: "and",
          conditions: [
            { type: "eq", attr: "status", value: "active" },
            { type: "eq", attr: "type", value: "test" },
            { type: "gt", attr: "createdAt", value: "2023-01-01" },
            { type: "lt", attr: "score", value: 100 },
          ],
        },
      }),
    );
  });

  it("should handle initial filter as single condition", async () => {
    const builder = new ScanBuilder(mockExecutor);
    
    // Add a single condition first
    builder.filter((op) => op.eq("status", "active"));
    
    // Then add more filters
    builder.filter((op) => op.eq("type", "test"));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          type: "and",
          conditions: [
            { type: "eq", attr: "status", value: "active" },
            { type: "eq", attr: "type", value: "test" },
          ],
        },
      }),
    );
  });

  it("should chain OR conditions properly", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder
      .filter((op) => op.or(op.eq("status", "active"), op.eq("status", "pending")))
      .filter((op) => op.or(op.eq("type", "test"), op.eq("type", "prod")));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          type: "and",
          conditions: [
            {
              type: "or",
              conditions: [
                { type: "eq", attr: "status", value: "active" },
                { type: "eq", attr: "status", value: "pending" },
              ],
            },
            {
              type: "or",
              conditions: [
                { type: "eq", attr: "type", value: "test" },
                { type: "eq", attr: "type", value: "prod" },
              ],
            },
          ],
        },
      }),
    );
  });

  it("should chain multiple OR conditions with complex logic", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder
      .filter((op) => op.or(op.eq("status", "active"), op.eq("status", "pending")))
      .filter((op) => op.eq("verified", true))
      .filter((op) => op.or(
        op.and(op.eq("type", "premium"), op.gt("score", 80)),
        op.and(op.eq("type", "basic"), op.gt("score", 60))
      ));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          type: "and",
          conditions: [
            {
              type: "or",
              conditions: [
                { type: "eq", attr: "status", value: "active" },
                { type: "eq", attr: "status", value: "pending" },
              ],
            },
            { type: "eq", attr: "verified", value: true },
            {
              type: "or",
              conditions: [
                {
                  type: "and",
                  conditions: [
                    { type: "eq", attr: "type", value: "premium" },
                    { type: "gt", attr: "score", value: 80 },
                  ],
                },
                {
                  type: "and",
                  conditions: [
                    { type: "eq", attr: "type", value: "basic" },
                    { type: "gt", attr: "score", value: 60 },
                  ],
                },
              ],
            },
          ],
        },
      }),
    );
  });

  it("should handle OR as the first filter followed by AND conditions", async () => {
    const builder = new ScanBuilder(mockExecutor);
    builder
      .filter((op) => op.or(op.eq("category", "A"), op.eq("category", "B")))
      .filter((op) => op.eq("active", true))
      .filter((op) => op.gt("score", 50));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          type: "and",
          conditions: [
            {
              type: "or",
              conditions: [
                { type: "eq", attr: "category", value: "A" },
                { type: "eq", attr: "category", value: "B" },
              ],
            },
            { type: "eq", attr: "active", value: true },
            { type: "gt", attr: "score", value: 50 },
          ],
        },
      }),
    );
  });

  it("should chain OR with existing OR condition", async () => {
    const builder = new ScanBuilder(mockExecutor);
    
    // Start with a complex OR condition
    builder.filter((op) => op.or(
      op.eq("status", "active"), 
      op.eq("status", "pending"), 
      op.eq("status", "review")
    ));
    
    // Add another OR condition - should be wrapped in AND
    builder.filter((op) => op.or(
      op.eq("priority", "high"), 
      op.eq("priority", "urgent")
    ));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          type: "and",
          conditions: [
            {
              type: "or",
              conditions: [
                { type: "eq", attr: "status", value: "active" },
                { type: "eq", attr: "status", value: "pending" },
                { type: "eq", attr: "status", value: "review" },
              ],
            },
            {
              type: "or",
              conditions: [
                { type: "eq", attr: "priority", value: "high" },
                { type: "eq", attr: "priority", value: "urgent" },
              ],
            },
          ],
        },
      }),
    );
  });
});
