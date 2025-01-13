import type { DynamoRecord } from "../builders/types";
import type { PrimaryKeyWithoutExpression } from "../dynamo/dynamo-types";
import type { RepositoryPlugin } from "../repository/types";

interface TimestampConfig {
  attributeName: string;
  onUpdate?: boolean;
}

export class TimestampsPlugin<T extends DynamoRecord> implements RepositoryPlugin<T> {
  name = "timestamps";

  config: TimestampConfig[];

  constructor(config: TimestampConfig[]) {
    this.config = config;
  }

  getAttributes = (isUpdate: boolean) => {
    const now = new Date().toISOString();

    return this.config.reduce(
      (previous, { attributeName, onUpdate }) => {
        if ((isUpdate && onUpdate) || !isUpdate) {
          previous[attributeName] = now;
        }
        return previous;
      },
      {} as Record<string, string>,
    );
  };

  hooks = {
    beforeCreate: async (data: T): Promise<T> => {
      return {
        ...data,
        ...this.getAttributes(false),
      };
    },

    beforeUpdate: async (key: PrimaryKeyWithoutExpression, updates: Partial<T>): Promise<Partial<T>> => {
      return {
        ...updates,
        ...this.getAttributes(true),
      };
    },
  };
}
