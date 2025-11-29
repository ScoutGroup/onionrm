# OnionRM Scripts

This directory contains utility scripts for OnionRM development and testing.

## prepare-test-db.sh

Prepares the PostgreSQL test database for running OnionRM tests.

### What it does:

1. Waits for PostgreSQL to be ready
2. Drops existing `onionrm_test` database (if exists)
3. Creates fresh `onionrm_test` database
4. Creates test user `onionrm_test` with password
5. Grants necessary privileges
6. Generates `test/config.js` with connection settings
7. Verifies the connection works

### Usage:

```bash
# Using npm script (recommended)
npm run test:prepare-db

# Or directly
bash scripts/prepare-test-db.sh
```

### Environment Variables:

You can customize the database connection by setting environment variables:

```bash
DB_HOST=localhost DB_PORT=7101 npm run test:prepare-db
```

Available variables:
- `DB_HOST` - Database host (default: `localhost`)
- `DB_PORT` - Database port (default: `7101`)
- `DB_USER` - Admin user (default: `postgres`)

### Prerequisites:

- PostgreSQL running on port 7101 (or custom port)
- Docker Compose: `docker-compose -f test-docker-compose.yml up -d`
- `psql` command-line tool installed

### After Running:

Once the database is prepared, you can run tests:

```bash
# Run all tests
make test

# Or with npm
npm test

# Or directly
ORM_PROTOCOL=postgres node test/run
```

## Docker Compose Setup

The test database can be started with Docker Compose:

```bash
# Start database
docker-compose -f test-docker-compose.yml up -d

# Prepare database and run tests
npm run test:prepare-db
npm test

# Stop database
docker-compose -f test-docker-compose.yml down
```

The test database configuration:
- Image: `sibedge/postgres-plv8:16.10-3.2.3-alpine`
- Port: `7101` (host) → `5432` (container)
- User: `postgres`
- Authentication: trust (no password required for admin)
- Health check: Automatic readiness detection
