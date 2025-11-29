# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**OnionRM** is a PostgreSQL-focused ORM for Node.js, forked from node-orm2. Unlike database-agnostic ORMs, OnionRM embraces PostgreSQL-specific features like JSON, arrays, and native data types.

The codebase is written in JavaScript (not TypeScript) and uses callbacks (not promises/async-await).

## Development Commands

### Running Tests
```bash
# Run all integration tests
make test

# Or directly with node
ORM_PROTOCOL=postgres node test/run

# Tests require test/config.js (see test/config.example.js for setup)
```

### Test Configuration
Tests require a `test/config.js` file. Copy from `test/config.example.js` and configure database connection strings for your local PostgreSQL instance.

## Architecture Overview

### Core Components

**lib/ORM.js** - Entry point exposing `orm.connect()` and `orm.use()` for database connections. Exports comparators (eq, ne, gt, lt, gte, lte, between, not_in, any, mod) and the `enforce` validation library.

**lib/Model.js** - Core model definition and management. Models are created via `db.define(tableName, properties, options)`. Handles:
- Model creation and property definition
- Association management (hasOne, hasMany, extendsTo)
- Lifecycle hooks (beforeCreate, afterCreate, beforeSave, afterSave, beforeRemove, afterRemove, afterLoad, afterAutoFetch)
- Instance creation and validation

**lib/Instance.js** - ORM model instances with CRUD methods:
- `instance.save(callback)` - Save changes
- `instance.remove(callback)` - Delete instance
- `instance.isDirty()` - Check for unsaved changes
- Property getters/setters with dirty tracking
- Association getters (lazy and eager loading)

**lib/ChainFind.js** - Chainable query builder for complex queries. Supports:
- `find(conditions)` / `one(conditions)` - Start query chain
- `join(table, toField, fromField)` - Join tables
- `with(conditions)` - Filter on joined tables (applies to last join)
- `limit(n)` / `offset(n)` - Pagination
- `order(field)` - Sorting (prefix with `-` for DESC)
- `only([fields])` / `omit([fields])` - Column selection
- `run(callback)` - Execute and return ORM instances
- `asJson(callback)` - Execute and return JSON directly from PostgreSQL

### SQL Generation (lib/sql/)

**lib/sql/Query.js** - Exports SQL query builders and comparator functions.

**lib/sql/Comparators.js** - Defines filter operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `between`, `not_in`, `any`, `mod`.

**lib/sql/Select.js** - SELECT query builder with join support and complex filtering.

**lib/sql/Insert.js** - INSERT query builder. Currently handles single-row inserts. Being enhanced to support batch inserts via `setBatch()` method.

**lib/sql/Update.js** - UPDATE query builder.

**lib/sql/Remove.js** - DELETE query builder.

**lib/sql/Where.js** - WHERE clause builder handling comparators and nested conditions.

**lib/sql/Helpers.js** - SQL utility functions (escaping, type conversion).

### Database Drivers (lib/Drivers/)

**lib/Drivers/DML/postgres.js** - PostgreSQL driver implementing:
- `insert()`, `update()`, `remove()`, `find()`, `count()`, `clear()`
- Connection pooling via node-postgres (pg)
- Query execution and result transformation
- Property-to-database-type conversions
- Transaction support

**lib/Drivers/DDL/** - Schema management (CREATE TABLE, ALTER TABLE, DROP TABLE).

### Associations (lib/Associations/)

**lib/Associations/One.js** - hasOne / belongsTo relationships.

**lib/Associations/Many.js** - hasMany relationships with lazy/eager loading.

**lib/Associations/Extend.js** - extendsTo for table inheritance patterns.

### Supporting Libraries

**lib/Property.js** - Property type definitions and validations.

**lib/Validators.js** - Built-in validators (now mostly delegated to `enforce` library).

**lib/Utilities.js** - Helper functions for property transformation and data manipulation.

**lib/Settings.js** - Configuration management for ORM and model settings.

**lib/Singleton.js** - Singleton pattern for preventing duplicate instances with same ID.

**lib/Hook.js** - Lifecycle hook execution utilities.

## Key Design Patterns

### Callback-Based API
All async operations use Node.js callbacks: `function(err, result)`. No promises or async/await.

### Chainable Query Builder
Queries are built by chaining methods, only executing when `run()` or `asJson()` is called:
```javascript
Model.find({status: 1})
  .join("customers", "id", "customer_id")
  .with({name: "Fred"})
  .limit(100)
  .order("-created_at")
  .run(callback);
```

### Associations
Relationships are defined on models and resolved lazily or eagerly:
```javascript
Order.hasOne("customer", Customer);
LineItem.hasMany("options", Option, { reverse: "lineItem" });
```

### Property Transformations
Properties are transformed bidirectionally:
- `propertyToValue()` - ORM value → Database value
- `valueToProperty()` - Database value → ORM value

This handles PostgreSQL-specific types (JSON, arrays, dates, UUIDs).

### Partition Support
Models can define a `partition` function to route records to partition tables. The function is called with the instance context and returns the target table name.

## Current Development: Batch Insert Optimization

See `specs/01-onionrm-batch-insert-optimization.md` for full specification.

**Goal:** Add `Model.createBatch()` method for high-performance bulk inserts using PostgreSQL multi-row INSERT syntax.

**Key Changes:**
1. **lib/sql/Insert.js** - Add `setBatch(valuesArray)` method and multi-row INSERT generation
2. **lib/Drivers/DML/postgres.js** - Add `batchInsert()` method with automatic batching (default 500 records/batch)
3. **lib/Model.js** - Add `model.createBatch(dataArray, options, callback)` method

**Design Principle:** `Model.createBatch()` is a separate explicit method. `Model.create()` remains completely unchanged for zero risk to existing code.

**Performance Target:** 10-15x faster for bulk operations (1000 records in <2 seconds vs 10-30 seconds).

## Testing

Tests are in `test/integration/` and use Mocha + Should.js.

Test structure:
- `test/common.js` - Shared test utilities and connection string management
- `test/run.js` - Test runner that discovers and executes all integration tests
- `test/integration/*` - Integration test suites for each feature

When adding new features:
1. Add integration tests in `test/integration/`
2. Tests automatically discovered by `test/run.js`
3. Ensure both positive cases and error handling are tested

## Code Style

- Use tabs for indentation
- Use `var` declarations (ES5 style)
- Callback-based async patterns
- Lodash for utility functions (`_` variable)
- Explicit property checks: `obj.hasOwnProperty(key)`
- No arrow functions, no template literals (ES5 compatibility)

## PostgreSQL-Specific Features

OnionRM embraces PostgreSQL features:
- Native JSON/JSONB types
- Array types
- UUID types
- `ANY` operator for array matching
- `RETURNING *` clause for getting inserted/updated data
- Partitioned tables via `partition` function

## Common Gotchas

1. **Associations on joined models**: The `with()` operator only applies to the immediately preceding `join()`, not globally.

2. **Property name mapping**: Model property names can differ from database column names via `mapsTo` option.

3. **Dirty tracking**: Only properties that have changed are included in UPDATE statements.

4. **Partition tables**: When using partitioned tables, ensure batch operations go to the same partition.

5. **Callback order**: Lifecycle hooks fire in sequence: beforeValidation → beforeSave/beforeCreate → afterSave/afterCreate.

6. **Query execution**: ChainFind methods don't execute until `run()`, `asJson()`, or a callback is provided to `find()`/`one()`.
