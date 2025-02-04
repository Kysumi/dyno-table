
# Bugs
  * In errors logs the queries are not being correclty turned from DDB query to human readable query
  * [DynamoDB Programming Errors](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.Errors.html)
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

## REPOSITORY GLUEING
allow glueing repositories together
  * query method would restrict types returned to the glued repository
      * would return the items in a structured manor
      * would have to define the relationship and relationship names

## PAGINATION / LIMIT IMPROVEMENTS / BUGS
making pagination better
  * limit should not apply to the page size, it should apply to the TOTAL number of items returned
  * paginate should take a page size and page till the total number of items is reached

LIMIT should not use the DDB limit directly it should internally load data until the total number of items is reached

query/scan need to always return the desired limit for the developer
maybe need to make an iterator object? allow a for loop to make it work

* Migrations

* Read DDB docs to ensure no limitations have been missed / overlooked
  * assert all exceptions have been caught and handled + rethrown
  * transactions + batch operations

* Make it so the builder can output the query as a string
  * both for the DDB query(marshelled style) and the human readable query (js style)
  * tokenised and untokenised

* allow db to taking in logging library
  * allow verbose logging to be turned on


Flip the API for the batch and transaction methods
* it should pass down a "table" object that has the allowed operations on it for batch/transaction

* allow picking of specific attributes to be returned
  * this should be a method on the query builder
  * this should be a method on the scan builder

* prevent devs from attempting to do a write in a getTransaction method or in batchGet
* prevent devs from attempting to do a read in a batchWrite method


