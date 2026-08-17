import type { QueryBuilderInterface } from "../builders/builder-types.js";
import { Paginator } from "../builders/paginator.js";
import type { DynamoItem } from "../types.js";
import { ensureCheckpointRecordExists, patchCheckpoint } from "./checkpoint-store.js";
import type { CursorFn, MigrationCheckpointRepo, RunContext } from "./types.js";

export function makeCursor(ctx: RunContext, migrationRepo: MigrationCheckpointRepo, name: string): CursorFn {
  const seenIds = new Set<string>();

  return function cursor<T extends DynamoItem>(
    builder: QueryBuilderInterface<T>,
    options?: { id?: string; pageSize?: number },
  ) {
    const id = options?.id ?? "default";
    if (seenIds.has(id)) {
      throw new Error(`cursor() called twice with id "${id}" in migration "${name}" — each cursor needs a distinct id`);
    }
    seenIds.add(id);

    return {
      async *[Symbol.asyncIterator]() {
        if (ctx.apply) {
          await ensureCheckpointRecordExists(migrationRepo, name);
          const { item: record } = await migrationRepo.get({ name }).execute();
          const savedKey = record?.cursors?.[id]?.lastEvaluatedKey;
          if (savedKey) builder.startFrom(savedKey);
        }

        const paginator = new Paginator(builder, options?.pageSize);
        while (paginator.hasNextPage()) {
          const page = await paginator.getNextPage();
          for (const item of page.items) {
            ctx.scanned += 1;
            yield item;
          }

          if (ctx.apply && page.lastEvaluatedKey) {
            const lastEvaluatedKey = page.lastEvaluatedKey;
            await patchCheckpoint(migrationRepo, name, (record) => ({
              cursors: { ...(record?.cursors ?? {}), [id]: { lastEvaluatedKey } },
            }));
          }
        }

        if (ctx.apply) {
          await patchCheckpoint(migrationRepo, name, (record) => {
            const cursors = { ...(record?.cursors ?? {}) };
            delete cursors[id];
            return { cursors };
          });
        }
      },
    };
  };
}
