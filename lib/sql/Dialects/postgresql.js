var util    = require("util");
var helpers = require("../Helpers");

exports.DataTypes = {
    id: 'SERIAL PRIMARY KEY',
    int: 'INTEGER',
    float: 'REAL',
    bool: 'SMALLINT',
    text: 'TEXT'
};


exports.escape = function (query, args) {
	return helpers.escapeQuery(exports, query, args);
}

exports.escapeId = function () {
  var parenthesis = false;

  var escaped = Array.prototype.slice.apply(arguments).map(function (el) {
    if (typeof el == "object") {
      return el.str.replace(/\?:(id|value)/g, function (m) {
        if (m == "?:id") {
          return exports.escapeId(el.escapes.shift());
        }
        // ?:value
        return exports.escapeVal(el.escapes.shift());
      });
    } else if(el.indexOf('.') > -1){
      //JSON field syntax
      parenthesis = true;
      var parts = el.split('.');
      return "\"" + parts[0].replace(/\"/g, "\"\"") + "\"->>'" + parts[1].replace(/'/, '') + "'";
    }
    return el.split(".").map(function (ele) { return "\"" + ele.replace(/\"/g, "\"\"") + "\""; }).join(".");
  }).join(".");

  if(parenthesis){
    escaped = "(" + escaped + ")";
  }
  return escaped;
};

exports.escapeVal = function (val, timeZone) {
	if (val === undefined || val === null) {
		return 'NULL';
	}

	if (Array.isArray(val)) {
		if (val.length === 1 && Array.isArray(val[0])) {
			return "'{" + val[0].map(exports.escapeVal.bind(this)) + "}'";
		}
		return "'{" + val.map(exports.escapeVal.bind(this)).join(", ").replace(/\'/g, '"') + "}'";
	}

	if (util.isDate(val)) {
		return "'" + helpers.dateToString(val, timeZone || "local", { dialect: 'postgresql' }) + "'";
	}

	if (Buffer.isBuffer(val)) {
		return "'\\x" + val.toString("hex") + "'";
	}

	switch (typeof val) {
		case "number":
			if (!isFinite(val)) {
				val = val.toString();
				break;
			}
			return val;
		case "bigint":
			return val;
		case "boolean":
			return val ? "true" : "false";
		case "function":
			return val(exports);
		case "object":
			console.log(`OnionRM Error: Unexpected object requested in exports.escapeVal: ${JSON.stringify(val ?? {})}`, val)
			throw new Error(`Invalid object passed to onionrm/lib/sql/Dialetcs/postgresql.js -> exports.escapeVal: ${JSON.stringify(val ?? {})}`)
	}
	// No need to escape backslashes with default PostgreSQL 9.1+ config.
	// Google 'postgresql standard_conforming_strings' for details.
	return "'" + val.replace(/\'/g, "''") + "'";
};

exports.defaultValuesStmt = "DEFAULT VALUES";
