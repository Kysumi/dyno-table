
# Bugs
  * dot notation for set method doesn't work
  * In errors logs the queries are not being correclty turned from DDB query to human readable query
    * https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.Errors.html
# Features
  * Partial updates and full updates should be more clear.
    * for example, if you want to update a single field, within a nested object, you should be able to do that easily.
    * partial updates to arrays
  * Ability to enable logging for a specific query or all queries
    * see the exact DDB query payload?
    * see the easy to read query? with the aliases replaced?
  * Migrations
    * ability to load a DIR of migrations and execute them in order
    * store the migration results in the table
      * store the success or failure state message
    * lock the migration table to prevent multiple migrations from running at the same time

# TODO
* wind repos back to being really thin pre typed expression builder
  * this is to lower scope and make it easier to maintain through reducing complexity
  * allow consumers to extend and implement their own life cycle methods ontop of the base repo

* Migrations

* Read DDB docs to ensure no limitations have been missed / overlooked
  * assert all exceptions have been caught and handled + rethrown
  * transactions + batch operations

* Make it so the builder can output the query as a string
  * both for the DDB query(marshelled style) and the human readable query (js style)
  * tokenised and untokenised

* allow db to taking in logging library
  * allow verbose logging to be turned on

* string templating for GSI/Index names


Flip the API for the batch and transaction methods
* it should pass down a "table" object that has the allowed operations on it for batch/transaction

* allow picking of specific attributes to be returned
  * this should be a method on the query builder
  * this should be a method on the scan builder
