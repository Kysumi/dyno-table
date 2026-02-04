import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "../../conditions";
import { QueryBuilder } from "../query-builder";

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
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

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
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

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
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

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
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

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
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

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
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

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
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

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
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

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

  it("should maintain immutability when chaining filters after cloning", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder.filter((op) => op.eq("status", "active"));

    const clone = builder.clone();

    // Add different filters to each builder
    builder.filter((op) => op.eq("type", "original"));
    clone.filter((op) => op.eq("type", "cloned"));

    // Execute both and verify they have different filters
    const originalResult = await builder.execute();
    await originalResult.toArray(); // Consume the iterator to trigger executor call
    const originalCall = mockExecutor.mock.calls[0]?.[1];

    mockExecutor.mockClear();
    const cloneResult = await clone.execute();
    await cloneResult.toArray(); // Consume the iterator to trigger executor call
    const cloneCall = mockExecutor.mock.calls[0]?.[1];

    // Verify the filters are different (proving immutability)
    expect(originalCall.filter?.conditions?.[1]?.value).toBe("original");
    expect(cloneCall.filter?.conditions?.[1]?.value).toBe("cloned");
    expect(originalCall).not.toEqual(cloneCall);
  });

  it("should execute query with correct parameters", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder.limit(10).useIndex("myIndex");

    mockExecutor.mockResolvedValueOnce({ items: [], lastEvaluatedKey: null });
    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
      expect.objectContaining({
        limit: 10,
        indexName: "myIndex",
      }),
    );
    expect(resultIterator).toBeDefined();
    expect(typeof resultIterator[Symbol.asyncIterator]).toBe("function");
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

  it("should return the first matching item with findOne", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    mockExecutor.mockResolvedValueOnce({ items: [{ id: "1" }], lastEvaluatedKey: null });

    const result = await builder.findOne();

    expect(result).toEqual({ id: "1" });
  });

  it("should paginate until it finds a matching item with findOne", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    mockExecutor
      .mockResolvedValueOnce({ items: [], lastEvaluatedKey: { id: "next" } })
      .mockResolvedValueOnce({ items: [{ id: "2" }], lastEvaluatedKey: null });

    const result = await builder.findOne();

    expect(result).toEqual({ id: "2" });
    expect(mockExecutor).toHaveBeenCalledTimes(2);
  });

  it("should chain two filters with AND", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder.filter((op) => op.eq("status", "active")).filter((op) => op.eq("type", "test"));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
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
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder
      .filter((op) => op.eq("status", "active"))
      .filter((op) => op.eq("type", "test"))
      .filter((op) => op.eq("name", "test"));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
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
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder
      .filter((op) => op.eq("status", "active"))
      .filter((op) => op.or(op.eq("type", "test"), op.eq("type", "test2")));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
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
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder
      .filter((op) => op.eq("status", "active"))
      .filter((op) => op.or(op.eq("type", "test"), op.eq("type", "test2")))
      .filter((op) => op.gt("createdAt", "2023-01-01"))
      .filter((op) => op.and(op.lt("score", 100), op.ne("category", "deleted")));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
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
            { type: "lt", attr: "score", value: 100 },
            { type: "ne", attr: "category", value: "deleted" },
          ],
        },
      }),
    );
  });

  it("should handle filter chaining with existing AND condition", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);

    // First add a complex filter that creates an AND condition
    builder.filter((op) => op.and(op.eq("status", "active"), op.eq("type", "test")));

    // Then add more filters that should be appended to the existing AND
    builder.filter((op) => op.gt("createdAt", "2023-01-01"));
    builder.filter((op) => op.lt("score", 100));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
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
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);

    // Add a single condition first
    builder.filter((op) => op.eq("status", "active"));

    // Then add more filters
    builder.filter((op) => op.eq("type", "test"));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
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
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder
      .filter((op) => op.or(op.eq("status", "active"), op.eq("status", "pending")))
      .filter((op) => op.or(op.eq("type", "test"), op.eq("type", "prod")));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
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
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder
      .filter((op) => op.or(op.eq("status", "active"), op.eq("status", "pending")))
      .filter((op) => op.eq("verified", true))
      .filter((op) =>
        op.or(op.and(op.eq("type", "premium"), op.gt("score", 80)), op.and(op.eq("type", "basic"), op.gt("score", 60))),
      );

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
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
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);
    builder
      .filter((op) => op.or(op.eq("category", "A"), op.eq("category", "B")))
      .filter((op) => op.eq("active", true))
      .filter((op) => op.gt("score", 50));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
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
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);

    // Start with a complex OR condition
    builder.filter((op) => op.or(op.eq("status", "active"), op.eq("status", "pending"), op.eq("status", "review")));

    // Add another OR condition - should be wrapped in AND
    builder.filter((op) => op.or(op.eq("priority", "high"), op.eq("priority", "urgent")));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
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

  // Regression tests for the bug where single filter call with op.and() doesn't work
  it("should handle single filter call with multiple AND conditions (bug reproduction)", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);

    // This is the exact pattern that was failing
    builder.filter((op) =>
      op.and(
        op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"),
        op.eq("status", "finalised"),
        op.eq("digitised", true),
      ),
    );

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
      expect.objectContaining({
        filter: {
          type: "and",
          conditions: [
            { type: "eq", attr: "organisationId", value: "5b94480f-fe36-47e6-9369-e8c9534634c6" },
            { type: "eq", attr: "status", value: "finalised" },
            { type: "eq", attr: "digitised", value: true },
          ],
        },
      }),
    );
  });

  it("should flatten nested AND conditions when adding new AND filter to existing AND", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);

    // First add an AND condition
    builder.filter((op) => op.and(op.eq("status", "active"), op.eq("type", "test")));

    // Then add another AND condition - should flatten into single AND with all conditions
    builder.filter((op) => op.and(op.eq("verified", true), op.gt("score", 50)));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
      expect.objectContaining({
        filter: {
          type: "and",
          conditions: [
            { type: "eq", attr: "status", value: "active" },
            { type: "eq", attr: "type", value: "test" },
            { type: "eq", attr: "verified", value: true },
            { type: "gt", attr: "score", value: 50 },
          ],
        },
      }),
    );
  });

  it("should flatten nested AND conditions when adding AND filter to non-AND condition", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);

    // Start with a single condition
    builder.filter((op) => op.eq("status", "active"));

    // Add an AND condition - should flatten into single AND
    builder.filter((op) => op.and(op.eq("verified", true), op.gt("score", 50), op.ne("category", "deleted")));

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
      expect.objectContaining({
        filter: {
          type: "and",
          conditions: [
            { type: "eq", attr: "status", value: "active" },
            { type: "eq", attr: "verified", value: true },
            { type: "gt", attr: "score", value: 50 },
            { type: "ne", attr: "category", value: "deleted" },
          ],
        },
      }),
    );
  });

  it("should handle mixed single conditions and AND groups properly", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);

    // Mix of single conditions and AND groups
    builder
      .filter((op) => op.eq("status", "active")) // Single
      .filter((op) =>
        op.and(
          // AND group
          op.eq("verified", true),
          op.ne("deleted", true),
        ),
      )
      .filter((op) => op.gt("score", 50)) // Single
      .filter((op) =>
        op.and(
          // Another AND group
          op.contains("tags", "important"),
          op.between("priority", 1, 5),
        ),
      );

    const resultIterator = await builder.execute();
    await resultIterator.toArray(); // Consume the iterator to trigger executor call

    expect(mockExecutor).toHaveBeenCalledWith(
      mockKeyCondition,
      expect.objectContaining({
        filter: {
          type: "and",
          conditions: [
            { type: "eq", attr: "status", value: "active" },
            { type: "eq", attr: "verified", value: true },
            { type: "ne", attr: "deleted", value: true },
            { type: "gt", attr: "score", value: 50 },
            { type: "contains", attr: "tags", value: "important" },
            { type: "between", attr: "priority", value: [1, 5] },
          ],
        },
      }),
    );
  });

  it("should maintain immutability when flattening AND conditions", async () => {
    const builder = new QueryBuilder(mockExecutor, mockKeyCondition);

    // Create a base filter
    builder.filter((op) => op.and(op.eq("status", "active"), op.eq("type", "test")));

    // Clone before adding more filters
    const clone = builder.clone();

    // Add different filters to each
    builder.filter((op) => op.eq("variant", "original"));
    clone.filter((op) => op.and(op.eq("variant", "cloned"), op.gt("score", 100)));

    // Execute both
    const originalResult = await builder.execute();
    await originalResult.toArray();
    const originalCall = mockExecutor.mock.calls[0]?.[1];

    mockExecutor.mockClear();
    const cloneResult = await clone.execute();
    await cloneResult.toArray();
    const cloneCall = mockExecutor.mock.calls[0]?.[1];

    // Verify different results (proving immutability)
    expect(originalCall.filter.conditions).toHaveLength(3);
    expect(cloneCall.filter.conditions).toHaveLength(4);
    expect(originalCall.filter.conditions[2].value).toBe("original");
    expect(cloneCall.filter.conditions[2].value).toBe("cloned");
    expect(cloneCall.filter.conditions[3].value).toBe(100);
  });
});

//TODO test object equality

// array.[0] = { "NANAN" }

//TODO test NaN, INF and -INF
