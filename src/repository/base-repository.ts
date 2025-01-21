import type { Table } from "../table";
import type { QueryBuilder } from "../builders/query-builder";
import type { PrimaryKeyWithoutExpression } from "../dynamo/dynamo-types";
import type { PutBuilder } from "../builders/put-builder";
import type { DynamoRecord } from "../builders/types";
import type { PrimaryKey } from "../builders/operators";
import type { DeleteBuilder } from "../builders/delete-builder";
import type { ScanBuilder } from "../builders/scan-builder";

export abstract class BaseRepository<TData extends DynamoRecord, TIndexes extends string> {
  constructor(protected readonly table: Table<TIndexes>) {}

  /**
   * Templates out the primary key for the record, it is consumed for create, put, update and delete actions
   *
   * Unfortunately, TypeScript is not inferring the TData type when implmenting this method in a subclass.
   * https://github.com/microsoft/TypeScript/issues/32082
   */
  protected abstract createPrimaryKey(data: TData): PrimaryKeyWithoutExpression;

  /**
   * Default attribute applied to ALL records that get stored in DDB
   * Defines the type of the record.
   * For example User, Post, Comment etc.
   *
   * This helps to ensure isolation of models when using a single table design
   * @returns The type of the record as a string.
   */
  protected abstract getType(): string;

  /**
   * Used to define the attribute name for the type.
   * @returns The type attribute name as a string.
   */
  protected abstract getTypeAttributeName(): string;

  /**
   * Hook method called before inserting a record.
   * Subclasses can override this method to modify the data before insertion.
   * @param data - The record data.
   * @returns The modified record data.
   */
  protected beforeInsert(data: TData): TData {
    return data;
  }

  /**
   * Hook method called before updating a record.
   * Subclasses can override this method to modify the data before updating.
   * @param data - The partial record data to be updated.
   * @returns The modified partial record data.
   */
  protected beforeUpdate(data: Partial<TData>): Partial<TData> {
    return data;
  }

  /**
   * Checks if a record exists in the table.
   * @param key - The primary key of the record.
   * @returns A promise that resolves to true if the record exists, false otherwise.
   */
  async exists(key: PrimaryKeyWithoutExpression): Promise<boolean> {
    const item = await this.table.get(key);
    return item !== null;
  }

  /**
   * Type guard to check if the value is a primary key.
   * @param value - The value to check.
   * @returns True if the value is a primary key, false otherwise.
   */
  protected isPrimaryKey(value: PrimaryKeyWithoutExpression | TData): value is PrimaryKeyWithoutExpression {
    return "pk" in value && typeof value.pk === "string";
  }

  /**
   * Creates a new record in the table.
   * @param data - The record data.
   * @returns A PutBuilder instance to execute the put operation.
   */
  create(data: TData): PutBuilder<TData> {
    const key = this.createPrimaryKey(data);
    const item = {
      ...data,
      ...key,
    };
    const indexConfig = this.table.getIndexConfig();

    const builder = this.table
      .put<TData>(item)
      /**
       * Enforcing the type attribute for filter
       */
      .set(this.getTypeAttributeName(), this.getType() as unknown as TData[keyof TData])
      .whereNotExists(indexConfig.pkName);

    /**
     * If the table has a sort key, we need to ensure that the sort key does not exist
     * This is to prevent the creation of a duplicate record
     */
    if (indexConfig.skName) {
      builder.whereNotExists(indexConfig.skName);
    }

    return builder;
  }

  /**
   * Updates an existing record in the table.
   * @param key - The primary key of the record.
   * @param updates - The partial record data to be updated.
   * @returns A promise that resolves to the updated record or null if the record does not exist.
   */
  update(key: PrimaryKeyWithoutExpression, updates: Partial<TData>) {
    const processed = this.beforeUpdate(updates);

    const updateData = {
      ...processed,
      updatedAt: new Date().toISOString(),
    };

    return this.table.update<TData>(key).set(updateData).return("ALL_NEW");
  }

  /**
   * Upserts (inserts or updates) a record in the table.
   * @param data - The record data.
   * @returns A PutBuilder instance to execute the put operation.
   */
  upsert(data: TData): PutBuilder<TData> {
    const key = this.createPrimaryKey(data);

    return this.table.put<TData>({
      ...data,
      ...key,
    });
  }

  /**
   * Deletes a record from the table.
   * @param keyOrDTO - The primary key or the record data.
   * @returns A promise that resolves when the record is deleted.
   */
  delete(keyOrDTO: PrimaryKeyWithoutExpression | TData): DeleteBuilder<TData> {
    if (this.isPrimaryKey(keyOrDTO)) {
      return this.table.delete(keyOrDTO);
    }

    const key = this.createPrimaryKey(keyOrDTO);
    return this.table.delete(key);
  }

  /**
   * Finds a single record by its primary key.
   * @param key - The primary key of the record.
   * @returns A promise that resolves to the record or null if the record does not exist.
   */
  async findOne(key: PrimaryKey): Promise<TData | null> {
    const results = await this.table
      .query(key)
      .whereEquals(this.getTypeAttributeName(), this.getType())
      .limit(1)
      .execute();

    const item = results[0];

    if (!item) {
      return null;
    }

    return item as TData;
  }

  /**
   * Finds a single record by its primary key or throws an error if the record does not exist.
   * @param key - The primary key of the record.
   * @returns A promise that resolves to the record.
   * @throws An error if the record does not exist.
   */
  async findOrFail(key: PrimaryKeyWithoutExpression): Promise<TData> {
    const result = await this.findOne(key);

    if (!result) {
      throw new Error("Item not found");
    }

    return result;
  }

  /**
   * Creates a query builder for querying records by their primary key.
   * @param key - The primary key of the record.
   * @returns A QueryBuilder instance to build and execute the query.
   */
  query(key: PrimaryKey): QueryBuilder<TData, TIndexes> {
    return this.table
      .query<TData>(key)
      .whereEquals(this.getTypeAttributeName(), this.getType() as unknown as TData[keyof TData]);
  }

  /**
   * Creates a scan builder for scanning records.
   * @returns A ScanBuilder instance to build and execute the scan operation.
   */
  scan(): ScanBuilder<TData> {
    return this.table
      .scan<TData>()
      .whereEquals(this.getTypeAttributeName(), this.getType() as unknown as TData[keyof TData]);
  }
}
