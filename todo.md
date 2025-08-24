# Bugs

- In errors logs the queries are not being correctly turned from DDB query to human readable query
- [DynamoDB Programming Errors](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.Errors.html)

# Features

- Partial updates and full updates should be more clear.
  - for example, if you want to update a single field, within a nested object, you should be able to do that easily.
  - partial updates to arrays
    - Updating specific index

- Ability to enable logging for a specific query or all queries
  - see the exact DDB query payload?
  - see the easy to read query? with the aliases replaced?
  - would allow structured logging

- Migrations
  - ability to load a DIR of migrations and execute them in order
  - store the migration results in the table
    - store the success or failure state message
  - lock the migration table to prevent multiple migrations from running at the same time

- Transactions rework
  - Allow transactions to work across table instances

- Relationships + Adjacent records
  - Add built-in support for Adjacent records at repo level
    - eager loading
