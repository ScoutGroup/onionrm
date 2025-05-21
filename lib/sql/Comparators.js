operators = [
	'@@@',
	'!!',
	'!=',
	'&&',
	'<<',
	'<=',
	'<>',
	'<@',
	'>=',
	'>>',
	'?&',
	'?|',
	'@>',
	'@@',
	'||',
	'~~',
	'#',
	'%',
	'&',
	'<',
	'=',
	'>',
	'?',
	'@',
	'|',
	'~',
];

exports.between = function(a, b) {
	return createSpecialObject({ from: a, to: b }, 'between');
};
exports.not_between = function(a, b) {
	return createSpecialObject({ from: a, to: b }, 'not_between');
};
exports.like = function(expr) {
	return createSpecialObject({ expr: expr }, 'like');
};
exports.not_like = function(expr) {
	return createSpecialObject({ expr: expr }, 'not_like');
};
exports.date_eq = function(field, tz) {
	return createSpecialObject({ field: field, tz: tz }, 'date_eq');
};
exports.null_or_gt = function(expr) {
  return createSpecialObject({ expr: expr }, 'null_or_gt');
};
exports.null_or_lt = function(expr) {
  return createSpecialObject({ expr: expr }, 'null_or_lt');
};
exports.null_or_gte = function(expr) {
  return createSpecialObject({ expr: expr }, 'null_or_gte');
};
exports.null_or_lte = function(expr) {
  return createSpecialObject({ expr: expr }, 'null_or_lte');
};
exports.null_or_eq = function(expr) {
  return createSpecialObject({ expr: expr }, 'null_or_eq');
};


exports.not_in = function(v) {
	return createSpecialObject({ val: v }, 'not_in');
};
exports.any = function(v) {
	return createSpecialObject({ val: v }, 'any');
};
exports.not_any = function(v) {
	return createSpecialObject({ val: v }, 'not_any');
};

exports.not_contains = function(v) {
	return createSpecialObject({ val: v }, 'not_contains');
};

exports.bit_eq = function(v) {
	return createSpecialObject({ val: v }, 'bit_eq');
};
exports.bit_ne = function(v) {
	return createSpecialObject({ val: v }, 'bit_ne');
};

exports.overlaps = function(v) {
	return createSpecialObject({val: v}, '&&');
};

exports.op = op;

exports.eq = op('=');
exports.ne = op('<>');
exports.gt = op('>');
exports.gte = op('>=');
exports.lt = op('<');
exports.lte = op('<=');
exports.overlaps = op('&&');

// ltree extension: http://www.postgresql.org/docs/9.3/static/ltree.html
exports.lta = op('@>'); // ltree ancestor
exports.ltd = op('<@'); // ltree descendant
exports.ltm = op('~');  // ltree match

function op(operator) {
	if(operators.indexOf(operator) >= 0) {
		return function(v) {
			return createSpecialObject({val: v}, operator);
		};
	} else {
		throw new Error("Operator not supported.");
	}
}

function createSpecialObject(obj, tag) {
	Object.defineProperty(obj, "sql_comparator", {
		configurable : false,
		enumerable   : false,
		value        : function() { return tag; }
	});

	return obj;
}
