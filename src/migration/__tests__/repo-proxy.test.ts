import { describe, expect, it, vi } from "vitest";
import { wrapRepo } from "../repo-proxy";
import type { RunContext } from "../types";

function makeCtx(apply: boolean): RunContext {
  return { apply, writes: 0, scanned: 0, samples: [] };
}

function makeWriteBuilder(result: unknown) {
  return {
    condition: vi.fn(function (this: unknown) {
      return this;
    }),
    execute: vi.fn().mockResolvedValue(result),
    debug: vi.fn().mockReturnValue({ raw: "raw-command", readable: "readable-command" }),
  };
}

describe("wrapRepo", () => {
  it("passes get through untouched", () => {
    const getResult = { execute: vi.fn() };
    const repo = { get: vi.fn().mockReturnValue(getResult), create: vi.fn() };
    const wrapped = wrapRepo(repo, makeCtx(false));

    const result = wrapped.get({ name: "x" });

    expect(repo.get).toHaveBeenCalledWith({ name: "x" });
    expect(result).toBe(getResult);
  });

  it("passes query and scan through untouched", () => {
    const repo = { query: { byX: vi.fn() }, scan: vi.fn() };
    const wrapped = wrapRepo(repo, makeCtx(false));

    expect(wrapped.query).toBe(repo.query);
    expect(wrapped.scan).toBe(repo.scan);
  });

  it("dry run: intercepted write calls debug(), never execute(), and records a sample", async () => {
    const writeBuilder = makeWriteBuilder({ item: { id: "1" } });
    const repo = { create: vi.fn().mockReturnValue(writeBuilder) };
    const ctx = makeCtx(false);
    const wrapped = wrapRepo(repo, ctx);

    const result = await wrapped.create({ id: "1" }).execute();

    expect(writeBuilder.execute).not.toHaveBeenCalled();
    expect(writeBuilder.debug).toHaveBeenCalledOnce();
    expect(result).toBeUndefined();
    expect(ctx.writes).toBe(1);
    expect(ctx.samples).toEqual([{ raw: "raw-command", readable: "readable-command" }]);
  });

  it("apply run: intercepted write calls execute(), never debug(), and returns the real result", async () => {
    const writeBuilder = makeWriteBuilder({ item: { id: "1" } });
    const repo = { update: vi.fn().mockReturnValue(writeBuilder) };
    const ctx = makeCtx(true);
    const wrapped = wrapRepo(repo, ctx);

    const result = await wrapped.update({ id: "1" }, { name: "x" }).execute();

    expect(writeBuilder.execute).toHaveBeenCalledOnce();
    expect(writeBuilder.debug).not.toHaveBeenCalled();
    expect(result).toEqual({ item: { id: "1" } });
    expect(ctx.writes).toBe(1);
  });

  it("keeps chaining working on the proxied write builder", async () => {
    const writeBuilder = makeWriteBuilder(undefined);
    const repo = { delete: vi.fn().mockReturnValue(writeBuilder) };
    const wrapped = wrapRepo(repo, makeCtx(true));

    const chained = wrapped.delete({ id: "1" }).condition(() => true);
    await chained.execute();

    expect(writeBuilder.condition).toHaveBeenCalledOnce();
    expect(writeBuilder.execute).toHaveBeenCalledOnce();
  });
});
