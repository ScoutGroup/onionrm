# Testing OnionRM

This guide explains how to run tests for OnionRM.

## Quick Start

```bash
# 1. Start the test database
docker-compose -f test-docker-compose.yml up -d

# 2. Prepare the database (creates user, database, and config)
npm run test:prepare-db

# 3. Run tests
npm test
```

## Detailed Setup

### 1. Start Test Database

OnionRM uses PostgreSQL for testing. Start the test database with Docker Compose:

```bash
docker-compose -f test-docker-compose.yml up -d
```

This starts PostgreSQL 16.10 with PLV8 on port **7101**.

Check the database is running:
```bash
docker ps | grep onionrm-unit-test
```

### 2. Prepare Test Database

The `test:prepare-db` script automates database setup:

```bash
npm run test:prepare-db
```

This script:
- Creates the `onionrm_test` database
- Creates test user `onionrm_test` with password `test123`
- Grants necessary privileges
- Generates `test/config.js` with connection settings

### 3. Run Tests

Run the full test suite:

```bash
# Using npm
npm test

# Using make
make test

# Using node directly
ORM_PROTOCOL=postgres node test/run
```

Run specific test file:
```bash
ORM_PROTOCOL=postgres node test/run model-create-batch
```

## Test Database Configuration

The test database connection is configured in `test/config.js` (auto-generated):

```javascript
exports.postgres = {
	host     : "localhost:7101",
	user     : "onionrm_test",
	password : "test123",
	database : "onionrm_test"
};
```

**Note:** This file is auto-generated and ignored by git. Don't commit it.

## Custom Database Configuration

If you're using a different PostgreSQL instance, set environment variables:

```bash
DB_HOST=myhost DB_PORT=5432 npm run test:prepare-db
```

Or manually create `test/config.js`:

```javascript
exports.postgres = {
	host     : "your-host:port",
	user     : "your-user",
	password : "your-password",
	database : "onionrm_test"
};
```

## Troubleshooting

### Database Connection Errors

If tests fail with connection errors:

1. **Check database is running:**
   ```bash
   docker ps | grep onionrm-unit-test
   ```

2. **Check database health:**
   ```bash
   docker logs onionrm-unit-test
   ```

3. **Restart database:**
   ```bash
   docker-compose -f test-docker-compose.yml restart
   ```

4. **Re-run database preparation:**
   ```bash
   npm run test:prepare-db
   ```

### Permission Errors

If you get "permission denied" errors when connecting:

1. Ensure the test user was created:
   ```bash
   docker exec onionrm-unit-test psql -U postgres -c "\\du"
   ```

2. Re-run the preparation script:
   ```bash
   npm run test:prepare-db
   ```

### Port Already in Use

If port 7101 is already in use:

1. Stop any existing PostgreSQL on that port
2. Or change the port in `test-docker-compose.yml`
3. Update the port when running prepare script:
   ```bash
   DB_PORT=5433 npm run test:prepare-db
   ```

## Test Structure

Tests are located in `test/integration/`:

- `model-create.js` - Standard `Model.create()` tests
- `model-create-batch.js` - Batch insert `Model.createBatch()` tests
- `association-*.js` - Association tests
- `model-*.js` - Model-related tests
- `property-*.js` - Property type tests

## CI/CD Integration

For continuous integration:

```bash
# Start database in background
docker-compose -f test-docker-compose.yml up -d

# Wait for database to be ready (handled by prepare script)
npm run test:prepare-db

# Run tests
npm test

# Cleanup
docker-compose -f test-docker-compose.yml down
```

## Stopping Test Database

When you're done testing:

```bash
# Stop and remove container
docker-compose -f test-docker-compose.yml down

# Stop and remove container + volumes
docker-compose -f test-docker-compose.yml down -v
```

## Running Tests Without Docker

If you prefer to use a local PostgreSQL installation:

1. Ensure PostgreSQL is running
2. Set environment variables for your instance:
   ```bash
   DB_HOST=localhost DB_PORT=5432 DB_USER=postgres npm run test:prepare-db
   ```
3. Run tests as normal:
   ```bash
   npm test
   ```

## Test Coverage

OnionRM tests cover:

- ✅ Model CRUD operations
- ✅ Associations (hasOne, hasMany, extendsTo)
- ✅ Property types and transformations
- ✅ Validations
- ✅ Hooks and lifecycle events
- ✅ Query building and execution
- ✅ **Batch insert operations** (new)

## Performance Testing

The batch insert tests include performance benchmarks:

```bash
# Run only batch insert tests
ORM_PROTOCOL=postgres ./node_modules/.bin/mocha test/integration/model-create-batch.js --timeout 30000
```

Expected performance:
- 100 records: <100ms
- 1,000 records: <2 seconds
- 10,000 records: <20 seconds

## Contributing

When adding new tests:

1. Add test files to `test/integration/`
2. Follow existing test patterns (use `should`, `helper.connect()`)
3. Clean up after tests (use `helper.dropSync()`)
4. Ensure tests pass before submitting PR

## Need Help?

- Check [CLAUDE.md](CLAUDE.md) for codebase overview
- Check [BATCH-INSERT-IMPLEMENTATION.md](BATCH-INSERT-IMPLEMENTATION.md) for batch insert details
- Open an issue on GitHub
