var should   = require('should');
var helper   = require('../support/spec_helper');
var ORM      = require('../../');

describe("Model.createBatch() skipReturning", function() {
	var db = null;
	var Person = null;
	var driver = null;
	var originalExec = null;
	var statements = [];

	var data = function (count) {
		var rows = [];
		for (var i = 0; i < count; i++) {
			rows.push({ name: "Person " + i, age: 20 + i });
		}
		return rows;
	};

	before(function (done) {
		helper.connect(function (connection) {
			db = connection;
			driver = db.driver;

			return done();
		});
	});

	after(function () {
		return db.close();
	});

	beforeEach(function (done) {
		Person = db.define("person", {
			name : String,
			age  : Number
		});

		// Record the SQL that reaches the database
		statements = [];
		originalExec = driver.execSimpleQuery;
		driver.execSimpleQuery = function (query) {
			statements.push(query);
			return originalExec.apply(this, arguments);
		};

		return helper.dropSync([ Person ], done);
	});

	afterEach(function () {
		driver.execSimpleQuery = originalExec;
	});

	var inserts = function () {
		return statements.filter(function (query) { return /^INSERT/i.test(query); });
	};

	describe("without the option", function () {
		it("should end every INSERT with RETURNING * and return the ids", function (done) {
			Person.createBatch(data(5), { batchSize: 2 }, function (err, results) {
				should.equal(err, null);
				results.should.have.property("length", 5);

				inserts().should.have.property("length", 3);
				inserts().forEach(function (query) {
					query.should.match(/ RETURNING \*$/);
				});

				return done();
			});
		});
	});

	describe("with driverOptions.skipReturning: true", function () {
		it("should leave RETURNING * out of every INSERT and still insert every record", function (done) {
			Person.createBatch(data(5), { batchSize: 2, driverOptions: { skipReturning: true } }, function (err, results) {
				should.equal(err, null);
				results.should.have.property("length", 0);

				inserts().should.have.property("length", 3);
				inserts().forEach(function (query) {
					query.should.not.match(/RETURNING/);
				});

				Person.count({}, function (err, count) {
					should.equal(err, null);
					count.should.equal(5);

					return done();
				});
			});
		});

		it("should still report the error of the database", function (done) {
			Person.createBatch([{ name: "John", age: "not a number" }], { driverOptions: { skipReturning: true } }, function (err) {
				should.exist(err);

				return done();
			});
		});
	});

	describe("with driverOptions.skipReturning: false", function () {
		it("should keep RETURNING *", function (done) {
			Person.createBatch(data(2), { driverOptions: { skipReturning: false } }, function (err, results) {
				should.equal(err, null);
				results.should.have.property("length", 2);
				inserts()[0].should.match(/ RETURNING \*$/);

				return done();
			});
		});
	});

	describe("with driverOptions.returning: false only", function () {
		// returning: false is passed by existing callers but is not honored yet; a future story makes it behave like
		// skipReturning. When that happens this test changes to expect no RETURNING.
		it("should keep RETURNING * for now", function (done) {
			Person.createBatch(data(2), { driverOptions: { returning: false } }, function (err, results) {
				should.equal(err, null);
				results.should.have.property("length", 2);
				inserts()[0].should.match(/ RETURNING \*$/);

				return done();
			});
		});
	});
});
