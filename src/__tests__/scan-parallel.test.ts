import { describe, expect, it, vi } from "vitest";
import { ScanBuilder, type ScanExecutor, type ScanOptions } from "../builders/scan-builder";
import { eq } from "../conditions";
import type { DynamoItem } from "../types";

interface Item extends DynamoItem {
  id: string;
}

describe("parallel scan", () => {
  it("merges every segment while paginating each one independently", async () => {
    const calls: Array<Pick<ScanOptions, "segment" | "totalSegments" | "lastEvaluatedKey">> = [];
    const executor: ScanExecutor<Item> = async (options) => {
      calls.push({
        segment: options.segment,
        totalSegments: options.totalSegments,
        lastEvaluatedKey: options.lastEvaluatedKey,
      });

      const segment = options.segment ?? -1;
      if (!options.lastEvaluatedKey) {
        return {
          items: [{ id: `${segment}-first` }],
          lastEvaluatedKey: { cursor: `segment-${segment}` },
        };
      }
      return { items: [{ id: `${segment}-last` }] };
    };

    const items: Item[] = [];
    for await (const item of new ScanBuilder(executor).segments(3)) {
      items.push(item);
    }

    expect(items.map(({ id }) => id).sort()).toEqual(["0-first", "0-last", "1-first", "1-last", "2-first", "2-last"]);
    for (let segment = 0; segment < 3; segment++) {
      expect(calls).toContainEqual({ segment, totalSegments: 3, lastEvaluatedKey: undefined });
      expect(calls).toContainEqual({
        segment,
        totalSegments: 3,
        lastEvaluatedKey: { cursor: `segment-${segment}` },
      });
    }
  });

  it("preserves filters and indexes on every segment clone", async () => {
    const calls: ScanOptions[] = [];
    const executor: ScanExecutor<Item> = async (options) => {
      calls.push({ ...options });
      return { items: [] };
    };

    await new ScanBuilder(executor).filter(eq("status", "active")).useIndex("status-index").segments(2).toArray();

    expect(calls).toHaveLength(2);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ segment: 0, totalSegments: 2, indexName: "status-index" }),
        expect.objectContaining({ segment: 1, totalSegments: 2, indexName: "status-index" }),
      ]),
    );
    expect(calls.every(({ filter }) => filter?.type === "eq" && filter.attr === "status")).toBe(true);
  });

  it("returns the same items from toArray and async iteration", async () => {
    const createScan = () =>
      new ScanBuilder<Item>(async ({ segment }) => ({ items: [{ id: String(segment) }] })).segments(2);
    const iterated: Item[] = [];
    for await (const item of createScan()) iterated.push(item);

    expect((await createScan().toArray()).map(({ id }) => id).sort()).toEqual(iterated.map(({ id }) => id).sort());
  });

  it("yields whichever segment produces an item first", async () => {
    let resolveSlow: (result: { items: Item[] }) => void = () => undefined;
    const slowPage = new Promise<{ items: Item[] }>((resolve) => {
      resolveSlow = resolve;
    });
    const executor: ScanExecutor<Item> = async ({ segment }) => {
      if (segment === 0) return slowPage;
      return { items: [{ id: "fast" }] };
    };
    const iterator = new ScanBuilder(executor).segments(2)[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({ value: { id: "fast" }, done: false });
    resolveSlow({ items: [{ id: "slow" }] });
    await expect(iterator.next()).resolves.toEqual({ value: { id: "slow" }, done: false });
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it("applies limits across the merged scan", async () => {
    const executor: ScanExecutor<Item> = async ({ segment }) => ({
      items: [{ id: `${segment}-first` }, { id: `${segment}-second` }],
    });

    await expect(new ScanBuilder(executor).limit(1).segments(2).toArray()).resolves.toHaveLength(1);
  });

  it("paginates the merged scan while respecting its global limit", async () => {
    const createPaginator = () =>
      new ScanBuilder<Item>(async ({ segment }) => ({
        items: [{ id: `${segment}-first` }, { id: `${segment}-second` }],
      }))
        .limit(3)
        .segments(2)
        .paginate(2);
    const paginator = createPaginator();

    expect(paginator.getCurrentPage()).toBe(0);
    const firstPage = await paginator.getNextPage();
    const secondPage = await paginator.getNextPage();
    expect(firstPage).toMatchObject({ page: 1, hasNextPage: true, items: { length: 2 } });
    expect(secondPage).toMatchObject({ page: 2, hasNextPage: false, items: { length: 1 } });
    expect(new Set([...firstPage.items, ...secondPage.items].map(({ id }) => id))).toHaveLength(3);
    await expect(paginator.getNextPage()).resolves.toEqual({ items: [], hasNextPage: false, page: 2 });
    await expect(createPaginator().getAllPages()).resolves.toHaveLength(3);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects an invalid page size: %s", (pageSize) => {
    const scan = new ScanBuilder<Item>(async () => ({ items: [] })).segments(2);

    expect(() => scan.paginate(pageSize)).toThrow("paginate: pageSize must be a positive integer");
  });

  it("does not run execution guards or scans until consumed", async () => {
    const beforeExecute = vi.fn(async () => {
      throw new Error("invalid input");
    });
    const executor = vi.fn(async () => ({ items: [] }));
    const scan = new ScanBuilder(executor, { beforeExecute }).segments(2);

    expect(beforeExecute).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
    await expect(scan.toArray()).rejects.toThrow("invalid input");
    expect(beforeExecute).toHaveBeenCalledTimes(2);
    expect(executor).not.toHaveBeenCalled();
  });

  it("rejects the merged iterator when any segment fails", async () => {
    const executor: ScanExecutor<Item> = async ({ segment }) => {
      if (segment === 1) throw new Error("segment failed");
      return { items: [] };
    };

    await expect(new ScanBuilder(executor).segments(2).toArray()).rejects.toThrow("segment failed");
  });

  it("rejects when a segment fails on a later page", async () => {
    let requestedContinuation = false;
    const executor: ScanExecutor<Item> = async ({ segment, lastEvaluatedKey }) => {
      if (segment !== 0) return { items: [{ id: "other-segment" }] };
      if (lastEvaluatedKey) {
        requestedContinuation = true;
        throw new Error("later page failed");
      }
      return { items: [{ id: "first-page" }], lastEvaluatedKey: { cursor: "next" } };
    };

    await expect(new ScanBuilder(executor).segments(2).toArray()).rejects.toThrow("later page failed");
    expect(requestedContinuation).toBe(true);
  });

  it.each([0, -1, 1.5, 1_000_001, Number.NaN])("rejects an invalid segment count: %s", (totalSegments) => {
    expect(() => new ScanBuilder<Item>(async () => ({ items: [] })).segments(totalSegments)).toThrow(
      "segments: totalSegments must be an integer between 1 and 1000000",
    );
  });
});
