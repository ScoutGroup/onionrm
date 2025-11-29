var Set = require("./Set");

exports.InsertQuery = InsertQuery;

function InsertQuery(Dialect, opts) {
	var sql = {};

	return {
		into: function (table) {
			sql.table = table;
			return this;
		},
		set: function (values) {
			sql.set = values;
			return this;
		},
		setBatch: function (valuesArray) {
			sql.setBatch = valuesArray;
			return this;
		},
		build: function () {
			var query = [], cols = [], vals = [];

			query.push("INSERT INTO");
			query.push(Dialect.escapeId(sql.table));

			// Handle batch insert
			if (sql.hasOwnProperty("setBatch") && Array.isArray(sql.setBatch)) {
				if (sql.setBatch.length === 0) {
					return "";
				}

				// Get columns from first record
				var firstRecord = sql.setBatch[0];
				for (var k in firstRecord) {
					if (firstRecord.hasOwnProperty(k)) {
						cols.push(Dialect.escapeId(k));
					}
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
							if (firstRecord.hasOwnProperty(key)) {
								rowVals.push(Dialect.escapeVal(sql.setBatch[i][key], opts.timezone));
							}
						}
						valuesClauses.push("(" + rowVals.join(", ") + ")");
					}

					query.push("VALUES " + valuesClauses.join(", "));
				}
			} else if (sql.hasOwnProperty("set")) {
				// Handle single insert
				for (var k in sql.set) {
					cols.push(Dialect.escapeId(k));
					vals.push(Dialect.escapeVal(sql.set[k], opts.timezone));
				}
				if (cols.length == 0) {
					query.push(Dialect.defaultValuesStmt);
				} else {
					query.push("(" + cols.join(", ") + ")");
					query.push("VALUES (" + vals.join(", ") + ")");
				}
			}

			return query.join(" ");
		}
	};
}
