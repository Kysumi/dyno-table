import type { DebuggableBuilder, RunContext } from "./types.js";

const WRITE_METHODS = new Set(["create", "upsert", "update", "delete"]);

/**
 * Wraps a repo so create/upsert/update/delete builders route their execute() through
 * ctx (dry-run capture vs real write); get/query/scan pass through untouched.
 */
export function wrapRepo<R extends Record<string, unknown>>(repo: R, ctx: RunContext): R {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof prop !== "string" || !WRITE_METHODS.has(prop) || typeof original !== "function") {
        return original;
      }
      return (...args: unknown[]) => {
        const builder = (original as (...a: unknown[]) => unknown).apply(target, args);
        return wrapWriteBuilder(builder as DebuggableBuilder, ctx);
      };
    },
  }) as R;
}

function wrapWriteBuilder<B extends DebuggableBuilder>(builder: B, ctx: RunContext): B {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === "execute") {
        return async () => {
          ctx.writes += 1;
          if (ctx.apply) return target.execute();
          ctx.samples.push(target.debug());
          return undefined;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
