
// Transforms:
// "name LIKE ? AND age > ?", ["John", 23]
// into:
// "name LIKE 'John' AND age > 23"
module.exports.escapeQuery = function (Dialect, query, args) {
  var pos = 0;

  return query.replace(/\?{1,2}/g, function (match) {
    if (match == '?') {
      return Dialect.escapeVal(args[pos++]);
    } else if (match == '??') {
      return Dialect.escapeId(args[pos++]);
    }
  });
};

module.exports.dateToString = function (date, timeZone, opts) {
  var dt = new Date(date);

  if (timeZone != 'local') {
    var tz = convertTimezone(timeZone);

    dt.setTime(dt.getTime() + (dt.getTimezoneOffset() * 60000));
    if (tz !== false) {
      dt.setTime(dt.getTime() + (tz * 60000));
    }
  }

  var year   = dt.getFullYear();
  var month  = zeroPad(dt.getMonth() + 1);
  var day    = zeroPad(dt.getDate());
  var hour   = zeroPad(dt.getHours());
  var minute = zeroPad(dt.getMinutes());
  var second = zeroPad(dt.getSeconds());
  var milli  = zeroPad(dt.getMilliseconds(), 3);

  if (opts.dialect == 'mysql') {
    return year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second + '.' + milli;
  } else {
    return year + '-' + month + '-' + day + 'T' + hour + ':' + minute + ':' + second + '.' + milli + 'Z';
  }
};

module.exports.resolveComparator = function(left, operator, right) {
  switch(operator) {
    case 'between':
      return left + " BETWEEN " + right.from + " AND " + right.to;
    case 'not_between':
      return left + " NOT BETWEEN " + right.from + " AND " + right.to;
    case 'like':
      return left + " LIKE " + right;
    case 'not_like':
      return left + " NOT LIKE " + right;
    case 'any':
      return left + " = ANY(" + right + ")";
    case 'not_any':
      return left + " <> ANY(" + right + ")";
    case 'not_contains':
      return right + " <> ALL(" + left + ")";
    case 'date_eq':
      //((field at time zone tz)::date::timestamp at time zone tz),
      var x = "((" + right.field + " at time zone " + right.tz + ")::date::timestamp at time zone " + right.tz + ")";
      //(((field + interval '1' day) at time zone tz)::date::timestamp at time zone tz)
      var y = "(((" + right.field + " + interval '1' day) at time zone " + right.tz + ")::date::timestamp at time zone " + right.tz + ")";
      return "(" + left + " >= " + x + " AND " + left + " < " + y + ")";
    case 'bit_eq':
      return '(' + left + ' & ' + right + ') = ' + right;
    case 'bit_ne':
      return '(' + left + ' & ' + right + ') <> ' + right;
    case 'null_or_gt':
      return '(' + left + ' IS NULL OR ' + left + ' > ' + right + ')';
    case 'null_or_lt':
      return '(' + left + ' IS NULL OR ' + left + ' < ' + right + ')';
    case 'null_or_gte':
      return '(' + left + ' IS NULL OR ' + left + ' >= ' + right + ')';
    case 'null_or_lte':
      return '(' + left + ' IS NULL OR ' + left + ' <= ' + right + ')';
      case 'null_or_eq':
        return '(' + left + ' IS NULL OR ' + left + ' = ' + right + ')';
    default:
      switch(operator) {
        case 'not_in' : return left + " <> ANY(" + right + ")";
        case '='      : op = (right == "NULL" ? 'IS' : '='); break;
        case '<>'     : op = (right == "NULL" ? 'IS NOT' : '<>'); break;
        default       : op = operator;
      }
      return left + ' ' + op + ' ' + right;
  }
};

function zeroPad(number, n) {
  if (arguments.length == 1) n = 2;

  number = "" + number;

  while (number.length < n) {
    number = "0" + number;
  }
  return number;
}

function convertTimezone(tz) {
  if (tz == "Z") return 0;

  var m = tz.match(/([\+\-\s])(\d\d):?(\d\d)?/);
  if (m) {
    return (m[1] == '-' ? -1 : 1) * (parseInt(m[2], 10) + ((m[3] ? parseInt(m[3], 10) : 0) / 60)) * 60;
  }
  return false;
}
