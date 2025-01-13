import type { DynamoRecord } from "../builders/types";
import type { PrimaryKeyWithoutExpression } from "../dynamo/dynamo-types";
import type { RepositoryPlugin } from "../repository/types";

export class LoggingPlugin<T extends DynamoRecord> implements RepositoryPlugin<T> {
  name = "logging";

  hooks = {
    afterCreate: async (data: T): Promise<void> => {
      console.log(`Created: ${JSON.stringify(data, null, 2)}`);
    },

    afterUpdate: async (data: T | null): Promise<void> => {
      this.log("Updated", data);
    },

    afterDelete: async (key: PrimaryKeyWithoutExpression): Promise<void> => {
      this.log("Deleted", key);
    },
  };

  log(action: string, data: T | PrimaryKeyWithoutExpression | null) {
    console.log(`${action}: ${JSON.stringify(data, null, 2)}`);
  }
}
