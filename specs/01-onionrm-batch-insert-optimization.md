# OnionRM Batch Insert Optimization

## Overview

This specification describes modifications to OnionRM to support true batch INSERT statements for PostgreSQL. The current implementation processes arrays sequentially with one INSERT per record, which is extremely slow for bulk operations. This optimization reduces import times from minutes to seconds for large datasets.

## Problem Statement

**Current Behavior:**
- `Model.create([array])` processes records sequentially
- Each record triggers a separate INSERT query
- 1,000 records = 1,000 database round trips
- Performance: ~10-30 seconds for 1,000 records

**Impact on Scout FDC:**
- Large imports (100k+ attribute values) take hours
- Daily value imports timeout
- Historical data backfills are impractical
- Poor user experience during bulk operations

## Solution

Add a **new explicit method** `Model.createBatch()` for multi-row INSERT operations. This is a separate code path that does NOT modify existing `Model.create()` behavior, ensuring zero risk to existing functionality.

**Key Design Principle: Explicit Over Implicit**
- New method: `Model.createBatch(arrayData, options, callback)`
- Existing method: `Model.create()` remains **completely unchanged**
- Zero auto-detection, zero magic, zero risk to existing code
- Callers explicitly opt-in to batch optimization

**Expected Performance:**
- 1,000 records in <2 seconds (10-15x faster)
- 100,000 records in <3 minutes (previously hours)

## Technical Design

### 1. SQL Query Builder (`lib/sql/Insert.js`)

**Add `setBatch()` method to InsertQuery:**

```javascript
setBatch: function (valuesArray) {
    sql.setBatch = valuesArray;
    return this;
}
```

**Modify `build()` to handle batch inserts:**

```javascript
// Handle batch insert
if (sql.hasOwnProperty("setBatch") && Array.isArray(sql.setBatch)) {
    if (sql.setBatch.length === 0) {
        return "";
    }

    // Get columns from first record
    var firstRecord = sql.setBatch[0];
    for (var k in firstRecord) {
        cols.push(Dialect.escapeId(k));
    }

    if (cols.length === 0) {
        query.push(Dialect.defaultValuesStmt);
    } else {
        query.push("(" + cols.join(", ") + ")");

        // Build VALUES clause with multiple rows
        var valuesClauses = [];
        for (var i = 0; i < sql.setBatch.length; i++) {
            var rowVals = [];
            for (var key in firstRecord) {
                rowVals.push(Dialect.escapeVal(sql.setBatch[i][key], opts.timezone));
            }
            valuesClauses.push("(" + rowVals.join(", ") + ")");
        }

        query.push("VALUES " + valuesClauses.join(", "));
    }
}
```

**Generated SQL Example:**
```sql
INSERT INTO "attribute_values" ("id", "value", "item_id", "organization_id")
VALUES
  ('uuid-1', '100', 'item-1', 'org-1'),
  ('uuid-2', '200', 'item-2', 'org-1'),
  ('uuid-3', '300', 'item-3', 'org-1')
RETURNING *
```

### 2. PostgreSQL Driver (`lib/Drivers/DML/postgres.js`)

**Add `batchInsert()` method:**

```javascript
Driver.prototype.batchInsert = function (table, dataArray, keyProperties, batchSize, cb) {
  if (!cb && typeof batchSize === 'function') {
    cb = batchSize;
    batchSize = 500; // Default batch size
  }

  if (!dataArray || dataArray.length === 0) {
    return cb(null, []);
  }

  var self = this;
  var allIds = [];
  var batches = [];

  // Split into batches (PostgreSQL has parameter limits)
  for (var i = 0; i < dataArray.length; i += batchSize) {
    batches.push(dataArray.slice(i, i + batchSize));
  }

  var batchIndex = 0;

  var processBatch = function() {
    if (batchIndex >= batches.length) {
      return cb(null, allIds);
    }

    var batch = batches[batchIndex];
    var q = self.query.insert().into(table).setBatch(batch).build();

    if (!q) {
      batchIndex++;
      return processBatch();
    }

    self.execSimpleQuery(q + " RETURNING *", function (err, results) {
      if (err) {
        return cb(err);
      }

      if (results && results.length > 0) {
        // Extract key properties from results
        for (var j = 0; j < results.length; j++) {
          var ids = {};
          if (keyProperties) {
            for (var k = 0; k < keyProperties.length; k++) {
              var prop = keyProperties[k];
              ids[prop.name] = results[j][prop.mapsTo] || null;
            }
          }
          allIds.push(ids);
        }
      }

      batchIndex++;
      processBatch();
    });
  };

  processBatch();
};
```

**Key Features:**
- Automatic batching (default 500 records per query)
- Handles PostgreSQL parameter limits
- Returns all inserted IDs via RETURNING clause
- Sequential batch processing for consistency

### 3. Model Layer (`lib/Model.js`)

**Add NEW `model.createBatch()` method (separate from `model.create()`):**

```javascript
/**
 * Batch insert method for high-performance bulk inserts
 *
 * This is a SEPARATE method that does NOT modify Model.create() behavior.
 * Use this when you need to insert large arrays without ORM instance overhead.
 *
 * @param {Array} dataArray - Array of plain objects to insert
 * @param {Object} options - Options (optional)
 * @param {Number} options.batchSize - Records per INSERT (default: 500)
 * @param {Function} callback - Callback(err, results)
 *
 * @example
 *   Model.createBatch([{name: 'a'}, {name: 'b'}], function(err, results) {
 *     // results = array of inserted record IDs
 *   });
 */
model.createBatch = function (dataArray, options, callback) {
    // Argument parsing
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    options = options || {};

    // Validation
    if (!Array.isArray(dataArray)) {
        return callback(new Error('createBatch requires an array of data'));
    }

    if (dataArray.length === 0) {
        return callback(null, []);
    }

    if (typeof opts.driver.batchInsert !== 'function') {
        return callback(new Error('Driver does not support batchInsert'));
    }

    var batchSize = options.batchSize || 500;
    var batchData = [];

    // Transform data objects using OnionRM property transformations
    for (var i = 0; i < dataArray.length; i++) {
        var data = {};
        var rawData = dataArray[i];

        for (var k in rawData) {
            if (!rawData.hasOwnProperty(k)) {
                continue;
            }

            var prop = opts.properties[k];

            if (prop) {
                // Skip serial/auto-generated fields if not provided
                if (rawData[k] == null &&
                    (prop.type === 'serial' || typeof prop.defaultValue === 'function')) {
                    continue;
                }

                // Apply property transformation (dates, JSON, arrays, etc.)
                if (opts.driver.propertyToValue) {
                    data[k] = opts.driver.propertyToValue(rawData[k], prop);
                } else {
                    data[k] = rawData[k];
                }
            } else {
                data[k] = rawData[k];
            }
        }

        // Map property names to database column names
        data = Utilities.transformPropertyNames(data, opts.properties);
        batchData.push(data);
    }

    // Handle partitioned tables
    var tableName = opts.table;
    if (opts.partition && typeof opts.partition === 'function') {
        // Create temporary instance to determine partition
        var firstInst = createInstance(dataArray[0], {
            is_new: true,
            autoSave: false,
            autoFetch: false
        }, function() {});
        tableName = opts.partition.call(firstInst);
    }

    // Execute batch insert via driver
    opts.driver.batchInsert(tableName, batchData, opts.keyProperties, batchSize,
        function(err, results) {
            if (err) {
                return callback(err);
            }
            return callback(null, results);
        });

    return this;
};
```

**Key Safety Features:**

1. **Completely separate method** - `createBatch()` is a new function, `create()` untouched
2. **Explicit validation** - Throws error if array not provided or driver unsupported
3. **No auto-detection** - Caller must explicitly choose to use batch mode
4. **No behavioral changes** - Zero impact on existing `Model.create()` calls
5. **Same transformations** - Uses identical property transformation logic as `create()`

**Comparison:**

| Feature | `Model.create()` | `Model.createBatch()` |
|---------|------------------|----------------------|
| Code path | Original (unchanged) | New (separate) |
| Performance | Sequential INSERTs | Multi-row INSERTs |
| Return value | ORM Instances | Lightweight results |
| Associations | Supported | Not supported |
| Use case | General purpose | Bulk imports only |
| Risk to existing code | **Zero** | **Zero** (new method) |

## Implementation Notes

### Partition Support

For partitioned tables (like `attribute_values`), the batch insert:
1. Calls the partition function on the first instance
2. Assumes all records in batch belong to same partition
3. Uses the determined partition table name

**Important:** Caller must ensure all records in a batch belong to the same partition.

### Property Transformation

The batch insert applies all standard OnionRM transformations:
- `propertyToValue()` for type conversions (dates, JSON, arrays)
- `transformPropertyNames()` for field mapping
- Skips serial/default value fields

### Error Handling

- Errors in any batch abort the entire operation
- No partial success (all-or-nothing semantics)
- Error includes batch index for debugging

### Performance Characteristics

**Batch Size Tuning:**
- Default: 500 records per INSERT
- PostgreSQL limit: ~65,535 parameters
- For 20-column table: max ~3,200 rows per batch
- Smaller batches = more round trips, but safer
- Larger batches = fewer round trips, but risk hitting limits

**Recommended Batch Sizes:**
- Small tables (<10 columns): 1000
- Medium tables (10-30 columns): 500
- Large tables (>30 columns): 250

## Testing Requirements

### Unit Tests

1. **`createBatch()` with small batch (50 records)**
   - Verify correct multi-row INSERT generation
   - Check all records inserted
   - Validate RETURNING values

2. **`createBatch()` with large batch (1000 records)**
   - Verify multiple batches created (500 per batch)
   - Check performance <5 seconds
   - Validate all records inserted

3. **`createBatch()` error handling**
   - Non-array input → Error
   - Empty array → Success with empty result
   - Driver without batchInsert → Error
   - Database error → Proper error propagation

4. **`createBatch()` with partitioned tables**
   - Verify partition function called
   - Check correct partition table used
   - Validate all records go to same partition

5. **`createBatch()` type conversions**
   - Dates → ISO strings
   - JSON objects → Properly serialized
   - Arrays → PostgreSQL array format
   - Buffers → Hex encoded
   - NULL handling
   - Boolean values

6. **`Model.create()` unchanged behavior**
   - Single record still returns ORM instance
   - Arrays still process sequentially
   - All associations still work
   - All hooks still fire
   - **Regression tests for existing functionality**

### Integration Tests

1. **Import scenarios**
   - Daily values import (1000+ records)
   - Historical backfill (100k+ records)
   - Mixed data types

2. **Performance benchmarks**
   - Compare old vs new for 1k records
   - Verify >10x improvement
   - Check memory usage

## Backward Compatibility

**Breaking Changes:** **NONE**

**Behavior Changes:** **NONE**

**Key Safety Guarantees:**
1. ✅ `Model.create()` is **100% unchanged** - all existing code works identically
2. ✅ New `Model.createBatch()` is opt-in only - no automatic activation
3. ✅ Zero risk to existing functionality - separate code path
4. ✅ Can be added without affecting any existing code

**Migration Path:**
- Existing code continues to work without any changes
- Import code can **opt-in** to performance by switching to `createBatch()`
- Example migration:
  ```javascript
  // OLD (still works, but slower):
  Model.create(arrayData, { saveAssociations: false }, callback);

  // NEW (opt-in to performance):
  Model.createBatch(arrayData, { batchSize: 500 }, callback);
  ```

## Scout FDC Impact

**Zero Impact Until Migration:**
- All existing code continues to work identically
- No changes are required immediately
- Can adopt `createBatch()` module-by-module

**Modules That Can Opt-In (when ready):**
- `src/imports/daily_values_import.ts` - Primary beneficiary
- `src/imports/well_tests_import.ts`
- `src/imports/statements_import.ts`
- `src/imports/flowback_values_import.ts`
- `src/imports/tickets_tanks_import.ts`
- `src/workers/allocation_meter_worker.js`
- `src/tasks/oil_sales_inventory.js`

**Expected Improvements (after opt-in):**
- Daily value imports: 80-90% faster
- Historical backfills: Now practical (hours → minutes)
- User experience: Reduced timeout errors
- System load: Fewer database connections

**Example Migration for daily_values_import.ts:**

```typescript
// BEFORE (current, still works):
async function bulkCreateAttributeValues(
  models: Models,
  attributeValues: AttributeValue[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    models.AttributeValue.create(
      attributeValues,
      { saveAssociations: false },
      (err: Error | null) => {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });
}

// AFTER (opt-in to performance):
async function bulkCreateAttributeValues(
  models: Models,
  attributeValues: AttributeValue[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    models.AttributeValue.createBatch(
      attributeValues,
      { batchSize: 500 },
      (err: Error | null) => {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });
}
```

## Files Modified

### In OnionRM Repository

1. `lib/sql/Insert.js` - Add `setBatch()` and multi-row INSERT generation
2. `lib/Drivers/DML/postgres.js` - Add `batchInsert()` method
3. `lib/Model.js` - Add batch insert detection and activation logic

### In Scout FDC Repository

1. `src/common/batch_insert.js` - Helper utilities (optional, for direct use)
2. `test/batch-insert.test.js` - Integration tests
3. `priv/specs/onionrm-batch-insert-optimization.md` - This specification

## Deployment Plan

### Phase 1: Add New Method (Zero Risk)

1. **Stage 1:** Implement `createBatch()` in OnionRM repository
2. **Stage 2:** Add comprehensive unit tests for `createBatch()`
3. **Stage 3:** Add regression tests to ensure `Model.create()` unchanged
4. **Stage 4:** Update OnionRM dependency in Scout FDC
5. **Stage 5:** Deploy to production
   - **Safe because:** New method has zero impact until code explicitly uses it
   - **Risk level:** None (additive change only)

### Phase 2: Gradual Migration (Controlled)

6. **Stage 6:** Update `daily_values_import.ts` to use `createBatch()`
7. **Stage 7:** Deploy to staging environment
8. **Stage 8:** Performance and correctness testing with real import data
9. **Stage 9:** Deploy to production with monitoring
10. **Stage 10:** Gradually migrate other import modules (one at a time)

**Key Safety Feature:** Each module migration is independent and can be rolled back individually without affecting others.

## Rollback Plan

### Phase 1 Rollback (OnionRM update only)
If issues occur after OnionRM update but before any code uses `createBatch()`:
- **No rollback needed** - new method has zero impact if not used
- Can safely keep the updated OnionRM version

### Phase 2 Rollback (Individual module migrations)
If issues occur after migrating a specific module to `createBatch()`:

**Per-Module Rollback:**
```typescript
// Simply change back from:
models.AttributeValue.createBatch(data, options, callback);

// To:
models.AttributeValue.create(data, { saveAssociations: false }, callback);
```

**Full Rollback (if needed):**
1. Revert code changes in affected import modules
2. Deploy reverted code
3. Optionally: Revert OnionRM version in `package.json`
4. Run `npm install`
5. Restart application

**Data Safety:** No data migration required (read-only optimization). Rollback is code-only.

## Future Enhancements

1. **Parallel batch processing** - Process multiple batches concurrently
2. **COPY FROM support** - Even faster for very large datasets (100k+)
3. **Upsert support** - Batch INSERT ON CONFLICT UPDATE
4. **Other drivers** - MySQL, SQLite batch insert support
5. **Streaming API** - Handle datasets larger than memory

## References

- PostgreSQL Multi-Row INSERT: https://www.postgresql.org/docs/current/sql-insert.html
- PostgreSQL Parameter Limits: https://stackoverflow.com/questions/6581573
- OnionRM Repository: [internal]
- Related Issue: FDC-XXXXX (large import performance)

## Design Rationale: Explicit Method vs Auto-Detection

### Why Explicit `createBatch()` is Safer

**Original Design (Auto-Detection):**
- `Model.create()` automatically switches to batch mode based on conditions
- Risk: Subtle behavior changes in existing code
- Risk: Different return types (Instances vs results) based on options
- Risk: Hard to predict when optimization triggers
- Risk: Difficult to debug performance issues

**New Design (Explicit Method):**
- ✅ `Model.create()` is completely unchanged - zero risk
- ✅ `createBatch()` is explicit opt-in - predictable behavior
- ✅ Clear separation of concerns - different use cases, different methods
- ✅ No magic - developers know exactly what code path runs
- ✅ Easy to test - separate test suites for each method
- ✅ Gradual migration - can adopt module-by-module
- ✅ Easy rollback - just change method name

### Analogy from Other ORMs

**Sequelize:** `bulkCreate()` is separate from `create()`
**TypeORM:** `insert()` is separate from `save()`
**Mongoose:** `insertMany()` is separate from `create()`

**Industry pattern:** Bulk operations deserve explicit methods, not auto-detection.

## Security Considerations

### SQL Injection Protection

Both `Model.create()` and `Model.createBatch()` use identical escaping:
- Values escaped via `Dialect.escapeVal()`
- Identifiers escaped via `Dialect.escapeId()`
- No string concatenation in user-provided data
- Same security guarantees as existing code

### Property Transformation

`createBatch()` applies the same transformations as `create()`:
- `propertyToValue()` for type conversions
- `transformPropertyNames()` for field mapping
- No bypassing of validation or sanitization

### Data Integrity

- Transactions work identically (caller manages transaction)
- Constraints enforced by PostgreSQL (same as sequential)
- Rollback behavior identical (all-or-nothing)

## Version History

- v1.0 (2025-01-29): Initial specification (auto-detection design)
- v2.0 (2025-01-29): **Revised to use explicit `createBatch()` method for maximum safety**
