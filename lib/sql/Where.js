var Helpers = require('./Helpers');

exports.build = function (Dialect, where, opts) {
  if (where.length === 0) {
    return [];
  }

  var query = [], subquery;

  for (var i = 0; i < where.length; i++) {
    subquery = buildOrGroup(Dialect, where[i], opts);

    if (subquery !== false) {
      query.push(subquery);
    }
  }

  if (query.length === 0) {
    return [];
  } else if (query.length == 1) {
    return "WHERE " + query[0];
  }

  return "WHERE (" + query.join(") AND (") + ")";
};

function buildOrGroup(Dialect, where, opts) {
  opts = opts || {};

  if (where.e) {
      // EXISTS

      wheres = [];
      if(Array.isArray(where.e.l[0]) && Array.isArray(where.e.l[1])) {
          try {
            for (i = 0; i < where.e.l[0].length; i++) {
                wheres.push(Dialect.escapeId(where.e.l[0][i]) + " = " + Dialect.escapeId(where.e.tl, where.e.l[1][i]));
            }
          } catch (whereException) {
            console.log(`onionrm.buildOrGroup error: ${whereException}`, where.e?.l);
            throw whereException;
          }
      } else {
        try {
          wheres.push(Dialect.escapeId(where.e.l[0]) + " = " + Dialect.escapeId(where.e.tl, where.e.l[1]));
        } catch (whereException) {
           console.log(`onionrm.buildOrGroup error: ${whereException}`, where.e?.l);
          throw whereException;
        }
      }

    try {
      return [
        "EXISTS (" +
        "SELECT * FROM " + Dialect.escapeId(where.e.t) + " " +
        "WHERE " + wheres.join(" AND ") + " " +
        "AND " + buildOrGroup(Dialect, { t: null, w: where.w }, opts) +
              ")"
      ];
    } catch (whereException2) {
      console.log(`onionrm.buildOrGroup where error: ${whereException2}`, where?.w);
      throw whereException2;
    }
  }

  var query = [], op;

  for (var k in where.w) {
    if (where.w[k] === null || where.w[k] === undefined) {
      query.push(
        buildComparisonKey(Dialect, where.t, k) +
        " IS NULL"
      );
      continue;
    }
    // not is an alias for not_and
    if ([ "or", "and", "not_or", "not_and", "not" ].indexOf(k) >= 0) {
      var q, subquery = [];
      var prefix = (k == "not" || k.indexOf("_") >= 0 ? "NOT " : false);

      op = (k == "not" ? "and" : (k.indexOf("_") >= 0 ? k.substr(4) : k)).toUpperCase();

      for (var j = 0; j < where.w[k].length; j++) {
        q = buildOrGroup(Dialect, { t: where.t, w: where.w[k][j] }, opts);
        if (q !== false) {
          subquery.push(q);
        }
      }

      if (subquery.length > 0) {
        query.push((prefix ? prefix : "") + "((" + subquery.join(") " + op + " (") + "))");
      }
      continue;
    }

    if (typeof where.w[k].sql_comparator == "function") {
      var left, right;
      op = where.w[k].sql_comparator();

      if(op === 'sql') {
        if (typeof where.w[k].where == "object") {
          var sql = where.w[k].where.str.replace("?:column", buildComparisonKey(Dialect, where.t, k));

          sql = sql.replace(/\?:(id|value)/g, function (m) {
            if (where.w[k].where.escapes.length === 0) {
              return '';
            }

            if (m == "?:id") {
              return Dialect.escapeId(where.w[k].where.escapes.shift());
            }
            // ?:value
            return Dialect.escapeVal(where.w[k].where.escapes.shift(), opts.timezone);
          });

          query.push(sql);
        }
      } else if(op === 'any' || op === 'not_any') {
        left  = Dialect.escapeVal(where.w[k].val, opts.timezone);
        right = buildComparisonKey(Dialect, where.t, k);

        query.push( Helpers.resolveComparator(left, op, right) );
      } else {
        left = buildComparisonKey(Dialect, where.t, k);

        if('val' in where.w[k]) {
          right = Dialect.escapeVal(where.w[k].val, opts.timezone);
        } else if('expr' in where.w[k]) {
          right = Dialect.escapeVal(where.w[k].expr, opts.timezone);
        } else {
          right = {
            from: Dialect.escapeVal(where.w[k].from, opts.timezone),
            to: Dialect.escapeVal(where.w[k].to, opts.timezone)
          };
        }

        query.push( Helpers.resolveComparator(left, op, right) );
      }

      continue;
    }

    if (Array.isArray(where.w[k])) {
      if (where.w[k].length === 0) {
        // #274: IN with empty arrays should be a false sentence
        query.push("FALSE");
      } else {
        query.push(buildComparisonKey(Dialect, where.t, k) + " = ANY(" + Dialect.escapeVal(where.w[k], opts.timezone) + ")");
      }
    } else {
      query.push(buildComparisonKey(Dialect, where.t, k) + " = " + Dialect.escapeVal(where.w[k], opts.timezone));
    }
  }

  if (query.length === 0) {
    return false;
  }

  return query.join(" AND ");
}

function buildComparisonKey(Dialect, table, column) {
  return (table ? Dialect.escapeId(table, column) : Dialect.escapeId(column));
}

function normalizeSqlConditions(Dialect, queryArray) {
  if (queryArray.length == 1) {
    return queryArray[0];
  }
  return Helpers.escapeQuery(Dialect, queryArray[0], queryArray[1]);
}
