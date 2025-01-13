import type { z } from "zod";
import type { DynamoRecord } from "../builders/types";
import type { PrimaryKeyWithoutExpression } from "../dynamo/dynamo-types";
import type { RepositoryPlugin } from "../repository/types";

export class ValidationPlugin<T extends DynamoRecord> implements RepositoryPlugin<T> {
  name = "validation";

  constructor(
    private createSchema: z.Schema<T>,
    private updateSchema: z.Schema<T>,
  ) {}

  hooks = {
    beforeCreate: async (data: T): Promise<T> => {
      return this.createSchema.parse(data);
    },

    beforeUpdate: async (key: PrimaryKeyWithoutExpression, updates: Partial<T>): Promise<Partial<T>> => {
      return this.updateSchema.parse(updates);
    },
  };
}
