var _       = require("lodash");
var pg      = require("pg");
// try{
//   pg = pg.native;
// }catch(e){}
var Query   = require("../../sql/Query").Query;
var shared  = require("./_shared");
var DDL     = require("../DDL/SQL");

exports.Driver = Driver;

var pools = {};

var switchableFunctions = {
  pool: {
    connect: function (cb) {
      this.db.connect(function (err, client, done) {
        if (!err) {
          done();
        }else{
          console.log("-->", err);
        }
        cb(err);
      });
    },
    execSimpleQuery: function (query, cb) {
      if (this.opts.debug) {
        require("../../Debug").sql('postgres', query);
      }
      this.db.connect(function (err, client, done) {
        if (err) {
          return cb(err);
        }

        client.query(query, function (err, result) {
          done();

          if (err) {
            cb(err);
          } else {
            cb(null, result.rows);
          }
        });
      });
      return this;
    },
    on: function(ev, cb) {
      // Because `pg` is the same for all instances of this driver
      // we can't keep adding listeners since they are never removed.
      return this;
    }
  },
  client: {
    connect: function (cb) {
      this.db.connect(cb);
    },
    execSimpleQuery: function (query, cb) {
      if (this.opts.debug) {
        require("../../Debug").sql('postgres', query);
      }
      var start, end, profiler;
      if(this.opts.profiler){
        start = new Date();
        profiler = this.opts.profiler;
      }
      this.db.query(query, function (err, result) {
        if(profiler){
          end = new Date();
          var duration = end - start;
          profiler(duration, query);
        }
        if (err) {
          cb(err);
        } else {
          cb(null, result.rows);
        }
      });
      return this;
    },
    on: function(ev, cb) {
      if (ev == "error") {
        this.db.on("error", cb);
      }
      return this;
    }
  }
};

function Driver(config, connection, opts) {
  var functions = switchableFunctions.client;

  this.dialect = 'postgresql';
  this.config = config || {};
  this.opts   = opts || {};
  if (!this.config.timezone) {
    this.config.timezone = "local";
  }

  this.query  = new Query({ dialect: this.dialect, timezone: this.config.timezone });
  this.customTypes = {};

  if (connection) {
    this.db = connection;
  } else {
    if (this.config.query && this.config.query.ssl) {
      config.ssl = true;
      this.config = _.extend(this.config, config);
    // } else {
    //   this.config = _.extend(this.config, config);
    //   this.config = config.href || config;
    }

    pg.types.setTypeParser(20, Number);

    if (opts.pool) {
      functions = switchableFunctions.pool;

      var key = JSON.stringify(this.config);
      if(!pools[key]){
        pools[key] = new pg.Pool(this.config);
      }
      this.db = pools[key];
      this.isPooled = true;
    } else {
      this.db = new pg.Client(this.config);
      this.isPooled = false;
    }
  }

  _.extend(this.constructor.prototype, functions);

  this.aggregate_functions = [
    "ABS", "CEIL", "FLOOR", "ROUND",
    "AVG", "MIN", "MAX",
    "LOG", "EXP", "POWER",
    "ACOS", "ASIN", "ATAN", "COS", "SIN", "TAN",
    "RANDOM", "RADIANS", "DEGREES",
    "SUM", "COUNT",
    "DISTINCT"
  ];
}

_.extend(Driver.prototype, shared, DDL);

Driver.prototype.ping = function (cb) {
  this.execSimpleQuery("SELECT * FROM pg_stat_activity LIMIT 1", function () {
    return cb();
  });
  return this;
};

Driver.prototype.begin = function (cb) {
  this.execSimpleQuery("begin", function () {
    return cb();
  });
  return this;
};

Driver.prototype.commit = function (cb) {
  this.execSimpleQuery("commit", function () {
    return cb();
  });
  return this;
};

Driver.prototype.rollback = function (cb) {
  this.execSimpleQuery("rollback", function () {
    return cb();
  });
  return this;
};

Driver.prototype.close = function (cb) {
  if(!this.isPooled){
    this.db.end();
  }

  if (typeof cb == "function") cb();

  return;
};

Driver.prototype.getQuery = function () {
  return this.query;
};

Driver.prototype.find = function (fields, table, conditions, opts, cb) {
  var i, q = this.query.select().from(table).select(fields);
  if(opts.joins){
    for(i = 0; i != opts.joins.length; i++){
      var join = opts.joins[i];
      q.from(join.toTable, join.toFields, join.fromTable, join.fromFields);

      if(join.toAlias == null) {
        join.toAlias = 'j' + (i + 1);
      }

      q.alias(join.toAlias);

      if(join.conditions){
        q.where(join.toAlias, join.conditions);
      }
    }
  }

  if (opts.offset) {
    q.offset(opts.offset);
  }
  if (typeof opts.limit == "number") {
    q.limit(opts.limit);
  }
  if (opts.order) {
    for (i = 0; i < opts.order.length; i++) {
      q.order(opts.order[i][0], opts.order[i][1], opts.order[i][2]);
    }
  }

  if(opts.distinct_on){
    q.distinct_on(opts.distinct_on);
  }

  if (opts.merge) {
    q.from(opts.merge.from.table, opts.merge.from.field, opts.merge.to.field).select(opts.merge.select);
    if (opts.merge.where && Object.keys(opts.merge.where[1]).length) {
      q = q.where(opts.merge.where[0], opts.merge.where[1], opts.merge.table || null, conditions);
    } else {
      q = q.where(opts.merge.table || null, conditions);
    }
  } else if(opts.joins){
    q = q.where(table, conditions);
  } else {
    q = q.where(conditions);
  }

  if (opts.exists) {
    for (var k in opts.exists) {
      q.whereExists(opts.exists[k].table, table, opts.exists[k].link, opts.exists[k].conditions);
    }
  }
  if(opts.format){
    q.format(opts.format);
  }
  if(opts.transform){
    q.transform(opts.transform.functionName, opts.transform.functionArgs);
  }

  q = q.build();

  this.execSimpleQuery(q, cb);
};

Driver.prototype.count = function (table, conditions, opts, cb) {
  var q = this.query.select().from(table).count(null, 'c');
  if(opts.joins){
    for(i = 0; i != opts.joins.length; i++){
      var join = opts.joins[i];
      q.from(join.toTable, join.toFields, join.fromTable, join.fromFields);
      if(join.conditions){
        q.where(join.toTable, join.conditions);
      }
    }
  }

  if (opts.merge) {
    q.from(opts.merge.from.table, opts.merge.from.field, opts.merge.to.field);
    if (opts.merge.where && Object.keys(opts.merge.where[1]).length) {
      q = q.where(opts.merge.where[0], opts.merge.where[1], conditions);
    } else {
      q = q.where(conditions);
    }
  } else if(opts.joins){
    q = q.where(table, conditions);
  } else {
    q = q.where(conditions);
  }

  if (opts.exists) {
    for (var k in opts.exists) {
      q.whereExists(opts.exists[k].table, table, opts.exists[k].link, opts.exists[k].conditions);
    }
  }

  q = q.build();

  this.execSimpleQuery(q, cb);
};

Driver.prototype.insert = function (table, data, keyProperties, cb) {
  var q = this.query.insert().into(table).set(data).build();

  this.execSimpleQuery(q + " RETURNING *", function (err, results) {
    if (err) {
      return cb(err);
    }

    var i, ids = {}, prop;

    if (keyProperties) {
      for (i = 0; i < keyProperties.length; i++) {
        prop = keyProperties[i];

        if(results[0]){
          ids[prop.name] = results[0][prop.mapsTo] || null;
        }else{ //TODO: if ignore returns
          ids[prop.name] = data[prop.name] || null;
        }
      }
    }

    return cb(null, ids);
  });
};

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

Driver.prototype.update = function (table, changes, conditions, cb) {
  var q = this.query.update().into(table).set(changes).where(conditions).build();

  this.execSimpleQuery(q, cb);
};

Driver.prototype.remove = function (table, conditions, cb) {
  var q = this.query.remove().from(table).where(conditions).build();

  this.execSimpleQuery(q, cb);
};

Driver.prototype.clear = function (table, cb) {
  var q = "TRUNCATE TABLE " + this.query.escapeId(table);

  this.execSimpleQuery(q, cb);
};

Driver.prototype.valueToProperty = function (value, property) {
  var customType, v;

  switch (property.type) {
    case "object":
      if (typeof value == "object" && !Buffer.isBuffer(value)) {
        break;
      }
      try {
        value = JSON.parse(value);
      } catch (e) {
        value = null;
      }
      break;
    case "json":
      //no-op, value is already an object
      break;
    case "point":
      if (typeof value == "string") {
        var m = value.match(/\((\-?[\d\.]+)[\s,]+(\-?[\d\.]+)\)/);

        if (m) {
          value = { x : parseFloat(m[1], 10) , y : parseFloat(m[2], 10) };
        }
      }
      break;
    case "array":
      // The driver converts this type for us.
      break;
    case "date":
      if (this.config.timezone && this.config.timezone != 'local') {
        var tz = convertTimezone(this.config.timezone);

        if(value !==null && value.getTime !== undefined){
          // shift local to UTC
          value.setTime(value.getTime() - (value.getTimezoneOffset() * 60000));
          if (tz !== false) {
            // shift UTC to timezone
            value.setTime(value.getTime() - (tz * 60000));
          }
        }
      }
      break;
    case "number":
      if (typeof value != 'number' && value !== null) {
        v = Number(value);
        if (!isNaN(v)) {
          value = v;
        }
      }
      break;
    default:
      customType = this.customTypes[property.type];

      if (customType && 'valueToProperty' in customType) {
        value = customType.valueToProperty(value);
      }
  }
  return value;
};

Driver.prototype.propertyToValue = function (value, property) {
  var customType;

  switch (property.type) {
    case "object":
      if (value !== null && !Buffer.isBuffer(value)) {
        value = new Buffer(JSON.stringify(value));
      }
      break;
    case "json":
      if (value !== null) {
        value = JSON.stringify(value);
      }
      break;
    case "date":
      if (this.config.timezone && this.config.timezone != 'local') {
        var tz = convertTimezone(this.config.timezone);

        if(value !== null && value.getTime !== undefined){
          // shift local to UTC
          value.setTime(value.getTime() + (value.getTimezoneOffset() * 60000));
          if (tz !== false) {
            // shift UTC to timezone
            value.setTime(value.getTime() + (tz * 60000));
          }
        }
      }
      break;
    case "point":
      return function () {
        return "POINT(" + value.x + ', ' + value.y + ")";
      };
    case "array":
      if(value){
        value = "{" + value.map(function(item) {
          if(_.isString(item)) {
            return '"' + item + '"';
          }
          return item;
        }) + "}";
      }
      break;
    default:
      customType = this.customTypes[property.type];

      if (customType && 'propertyToValue' in customType) {
        value = customType.propertyToValue(value);
      }
  }
  return value;
};

Object.defineProperty(Driver.prototype, "isSql", {
    value: true
});

function convertTimezone(tz) {
  if (tz == "Z") {
    return 0;
  }

  var m = tz.match(/([\+\-\s])(\d\d):?(\d\d)?/);

  if (m) {
    return (m[1] == '-' ? -1 : 1) * (parseInt(m[2], 10) + ((m[3] ? parseInt(m[3], 10) : 0) / 60)) * 60;
  }
  return false;
}
