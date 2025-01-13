import type { Table } from "../table";
import type { QueryBuilder } from "../builders/query-builder";
import type { PrimaryKeyWithoutExpression } from "../dynamo/dynamo-types";
import type { PutBuilder } from "../builders/put-builder";
import type { DynamoRecord } from "../builders/types";
import type { PrimaryKey } from "../builders/operators";
import type { RepositoryHooks, RepositoryPlugin } from "./types";

export abstract class BaseRepository<TData extends DynamoRecord> {
  private plugins: Map<string, RepositoryPlugin<TData>> = new Map();

  constructor(protected readonly table: Table) {}

  /**
   * Register a plugin with the repository
   */
  async use(plugin: RepositoryPlugin<TData>): Promise<this> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already registered`);
    }

    // Register plugin
    this.plugins.set(plugin.name, plugin);

    // Initialize plugin if needed
    if (plugin.initialize) {
      await plugin.initialize(this);
    }

    return this;
  }

  /**
   * Required methods that must be implemented by child classes
   */
  protected abstract createPrimaryKey(data: TData): PrimaryKeyWithoutExpression;
  protected abstract getType(): string;
  protected abstract getTypeAttributeName(): string;

  /**
   * Execute a lifecycle hook across all plugins
   */
  protected async executeHook<THook extends keyof RepositoryHooks<TData>>(
    hook: THook,
    ...args: Parameters<NonNullable<RepositoryHooks<TData>[THook]>>
  ): Promise<ReturnType<NonNullable<RepositoryHooks<TData>[THook]>>> {
    let result = args[0] as ReturnType<NonNullable<RepositoryHooks<TData>[THook]>>;

    for (const plugin of this.plugins.values()) {
      const hookMethod = plugin.hooks?.[hook];

      if (hookMethod) {
        // @ts-ignore disabling type check on ...args.slice(1)
        const hookResult = await hookMethod(result, ...args.slice(1));
        if (hookResult !== undefined) {
          result = hookResult as ReturnType<NonNullable<RepositoryHooks<TData>[THook]>>;
        }
      }
    }

    return result;
  }

  /**
   * Check if an item exists
   */
  async exists(key: PrimaryKeyWithoutExpression): Promise<boolean> {
    const item = await this.findOne(key);
    return item !== null;
  }

  /**
   * Create a new item
   */
  async create(data: TData): Promise<TData> {
    const item = {
      ...data,
      ...this.createPrimaryKey(data),
      [this.getTypeAttributeName()]: this.getType(),
    };
    // Items can only be inserted to the primary index
    const indexConfig = this.table.getIndexConfig();

    // Since this is a create method we want to ensure the item doesn't already exist
    const builder = this.table.put<TData>(item).whereNotExists(indexConfig.pkName);

    if (indexConfig.skName) {
      builder.whereNotExists(indexConfig.skName);
    }

    const processed = await this.executeHook("beforeCreate", data, builder);

    await builder.execute();
    await this.executeHook("afterCreate", processed);

    return processed;
  }

  /**
   * Update an existing item
   */
  async update(key: PrimaryKeyWithoutExpression, updates: Partial<TData>): Promise<TData | null> {
    const builder = this.table.update<TData>(key);

    await this.executeHook("beforeUpdate", key, updates, builder);

    const result = await builder.execute();
    const updated = result.Attributes as TData;

    await this.executeHook("afterUpdate", updated);

    return updated || null;
  }

  /**
   * Delete an item
   */
  async delete(key: PrimaryKeyWithoutExpression): Promise<void> {
    await this.executeHook("beforeDelete", key);
    await this.table.delete(key);
    await this.executeHook("afterDelete", key);
  }

  /**
   * Find a single item
   */
  /**
   * Find a single item
   */
  async findOne(key: PrimaryKey): Promise<TData | null> {
    const builder = this.table.query(key).where(this.getTypeAttributeName(), "=", this.getType()).limit(1);

    await this.executeHook("beforeFind", key, builder);

    const results = await builder.execute();
    const item = results.Items?.[0] as TData | null;

    return this.executeHook("afterFind", item);
  }

  /**
   * Find an item or throw if not found
   */
  async findOrFail(key: PrimaryKeyWithoutExpression): Promise<TData> {
    const result = await this.findOne(key);

    if (!result) {
      throw new Error(`${this.getType()} not found`);
    }

    return result;
  }

  /**
   * Start a query operation
   */
  protected query(key: PrimaryKey): QueryBuilder<TData> {
    const builder = this.table.query(key).where(this.getTypeAttributeName(), "=", this.getType());

    this.executeHook("beforeQuery", key, builder);

    return builder;
  }

  /**
   * Helper to check if a value is a primary key
   */
  protected isPrimaryKey(value: PrimaryKeyWithoutExpression | TData): value is PrimaryKeyWithoutExpression {
    return "pk" in value && typeof value.pk === "string";
  }
}
