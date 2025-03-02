# Debug Utilities

This directory contains utility functions for debugging DynamoDB expressions and commands.

## Debug Expression

The `debug-expression.ts` file provides utilities to make DynamoDB expressions more readable by replacing attribute name and value placeholders with their actual values.

### Example Usage

```typescript
import { debugExpression, debugCommand } from './utils/debug-expression';

// Example with a simple expression
const expression = '#name = :value AND attribute_exists(#age)';
const names = { '#name': 'userName', '#age': 'userAge' };
const values = { ':value': 'John Doe' };

const readableExpression = debugExpression(expression, names, values);
console.log(readableExpression);
// Output: "userName" = "John Doe" AND attribute_exists("userAge")

// Example with a complete command
const updateCommand = {
  tableName: 'Users',
  key: { pk: 'user#123', sk: 'profile' },
  updateExpression: 'SET #name = :name, #age = :age, #status = :status',
  conditionExpression: 'attribute_exists(#id)',
  expressionAttributeNames: {
    '#name': 'userName',
    '#age': 'userAge',
    '#status': 'userStatus',
    '#id': 'userId'
  },
  expressionAttributeValues: {
    ':name': 'Jane Doe',
    ':age': 30,
    ':status': 'active'
  }
};

const debuggedCommand = debugCommand(updateCommand);
console.log(JSON.stringify(debuggedCommand, null, 2));
/* Output:
{
  "tableName": "Users",
  "key": { "pk": "user#123", "sk": "profile" },
  "updateExpression": "SET #name = :name, #age = :age, #status = :status",
  "conditionExpression": "attribute_exists(#id)",
  "expressionAttributeNames": {
    "#name": "userName",
    "#age": "userAge",
    "#status": "userStatus",
    "#id": "userId"
  },
  "expressionAttributeValues": {
    ":name": "Jane Doe",
    ":age": 30,
    ":status": "active"
  },
  "readableUpdateExpression": "SET \"userName\" = \"Jane Doe\", \"userAge\" = 30, \"userStatus\" = \"active\"",
  "readableConditionExpression": "attribute_exists(\"userId\")"
}
*/
```

## Debug Transaction

The `debug-transaction.ts` file provides utilities to make DynamoDB transaction items more readable by replacing attribute name and value placeholders with their actual values.

### Example Usage

```typescript
import { Table } from '../table';
import { dynamoClient } from '../config';

// Create a table instance
const table = new Table(dynamoClient, {
  name: 'MyTable',
  partitionKey: 'pk',
  sortKey: 'sk'
});

// Create a transaction
const transaction = table.transactionBuilder();

// Add operations to the transaction
transaction.put('MyTable', {
  pk: 'user#123',
  sk: 'profile',
  name: 'John Doe',
  email: 'john@example.com'
});

const updateBuilder = table.update({
  pk: 'user#123',
  sk: 'settings'
});

updateBuilder
  .set('theme', 'dark')
  .set('notifications', true)
  .condition(op => op.attributeExists('pk'))
  .withTransaction(transaction);

// Debug the transaction
const debugInfo = transaction.debug();
console.log(JSON.stringify(debugInfo, null, 2));
/* Output:
[
  {
    "type": "Put",
    "tableName": "MyTable",
    "item": {
      "pk": "user#123",
      "sk": "profile",
      "name": "John Doe",
      "email": "john@example.com"
    }
  },
  {
    "type": "Update",
    "tableName": "MyTable",
    "key": {
      "pk": "user#123",
      "sk": "settings"
    },
    "readableUpdate": "SET \"theme\" = \"dark\", \"notifications\" = true",
    "readableCondition": "attribute_exists(\"pk\")"
  }
]
*/

// Execute the transaction
await transaction.execute();
```

These utilities are particularly useful when debugging complex DynamoDB operations, as they make it easier to understand what's happening with the expressions and attribute values. 