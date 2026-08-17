import type { DynamoItem, TableConfig } from "../types.js";
import type { PaginationResult } from "./builder-types.js";
import type { ResultIterator } from "./result-iterator.js";

async function* mergeAsyncIterables<T>(iterables: AsyncIterable<T>[], limit?: number): AsyncGenerator<T> {
  const iterators = iterables.map((iterable) => iterable[Symbol.asyncIterator]());
  const next = (iterator: AsyncIterator<T>) => iterator.next().then((result) => ({ iterator, result }));
  const pending = new Map(iterators.map((iterator) => [iterator, next(iterator)] as const));
  let yielded = 0;

  while (pending.size > 0 && (limit === undefined || yielded < limit)) {
    const { iterator, result } = await Promise.race(pending.values());
    if (result.done) {
      pending.delete(iterator);
    } else {
      yielded++;
      if (limit === undefined || yielded < limit) pending.set(iterator, next(iterator));
      yield result.value;
    }
  }
}

/** Async-iterable result that merges independent DynamoDB scan segments. */
export class ParallelScanIterator<T extends DynamoItem, TConfig extends TableConfig = TableConfig> {
  constructor(
    private readonly segments: Array<() => Promise<ResultIterator<T, TConfig>>>,
    private readonly limit?: number,
  ) {}

  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    yield* mergeAsyncIterables(await Promise.all(this.segments.map((execute) => execute())), this.limit);
  }

  async toArray(): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this) {
      items.push(item);
    }
    return items;
  }

  paginate(pageSize?: number): ParallelScanPaginator<T> {
    return new ParallelScanPaginator(this, pageSize);
  }
}

/** Page-by-page view over a merged parallel scan. Pagination state is kept in memory. */
export class ParallelScanPaginator<T extends DynamoItem> {
  // ponytail: keep N segment cursors in memory; add a composite token if cross-process resume is needed.
  private readonly iterator: AsyncIterator<T>;
  private currentPage = 0;
  private hasMorePages = true;
  private bufferedItem?: T;

  constructor(
    source: AsyncIterable<T>,
    private readonly pageSize?: number,
  ) {
    if (pageSize !== undefined && (!Number.isInteger(pageSize) || pageSize < 1)) {
      throw new Error("paginate: pageSize must be a positive integer");
    }
    this.iterator = source[Symbol.asyncIterator]();
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  hasNextPage(): boolean {
    return this.hasMorePages;
  }

  async getNextPage(): Promise<PaginationResult<T>> {
    if (!this.hasMorePages) {
      return { items: [], hasNextPage: false, page: this.currentPage };
    }

    const items: T[] = [];
    if (this.bufferedItem) {
      items.push(this.bufferedItem);
      this.bufferedItem = undefined;
    }

    while (this.pageSize === undefined || items.length < this.pageSize) {
      const result = await this.iterator.next();
      if (result.done) {
        this.hasMorePages = false;
        break;
      }
      items.push(result.value);
    }

    if (this.hasMorePages && this.pageSize !== undefined) {
      const result = await this.iterator.next();
      if (result.done) this.hasMorePages = false;
      else this.bufferedItem = result.value;
    }

    this.currentPage++;
    return { items, hasNextPage: this.hasMorePages, page: this.currentPage };
  }

  async getAllPages(): Promise<T[]> {
    const items: T[] = [];
    while (this.hasNextPage()) items.push(...(await this.getNextPage()).items);
    return items;
  }
}
