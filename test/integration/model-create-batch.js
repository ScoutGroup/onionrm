var should   = require('should');
var helper   = require('../support/spec_helper');
var ORM      = require('../../');

describe("Model.createBatch()", function() {
	var db = null;
	var Person = null;

	var setup = function () {
		return function (done) {
			Person = db.define("person", {
				name   : String,
				age    : Number,
				data   : { type: "json" }
			});

			return helper.dropSync([ Person ], done);
		};
	};

	before(function (done) {
		helper.connect(function (connection) {
			db = connection;

			return done();
		});
	});

	after(function () {
		return db.close();
	});

	describe("with valid array of data", function () {
		before(setup());

		it("should insert all records in batch", function (done) {
			var data = [
				{ name: "John Doe", age: 30 },
				{ name: "Jane Doe", age: 28 },
				{ name: "Jack Doe", age: 25 }
			];

			Person.createBatch(data, function (err, results) {
				should.equal(err, null);
				should(Array.isArray(results));
				results.should.have.property("length", 3);

				// Verify records were inserted
				Person.find({}, function (err, people) {
					should.equal(err, null);
					people.should.have.property("length", 3);

					return done();
				});
			});
		});
	});

	describe("with large batch (1000 records)", function () {
		before(setup());

		it("should split into multiple batches and insert all", function (done) {
			this.timeout(10000); // Allow more time for large batch

			var data = [];
			for (var i = 0; i < 1000; i++) {
				data.push({
					name: "Person " + i,
					age: 20 + (i % 50)
				});
			}

			Person.createBatch(data, { batchSize: 500 }, function (err, results) {
				should.equal(err, null);
				should(Array.isArray(results));
				results.should.have.property("length", 1000);

				// Verify all records were inserted
				Person.count({}, function (err, count) {
					should.equal(err, null);
					count.should.equal(1000);

					return done();
				});
			});
		});
	});

	describe("with JSON property types", function () {
		before(setup());

		it("should properly serialize JSON data", function (done) {
			var data = [
				{ name: "John", age: 30, data: { foo: "bar" } },
				{ name: "Jane", age: 28, data: { baz: "qux" } }
			];

			Person.createBatch(data, function (err, results) {
				should.equal(err, null);
				results.should.have.property("length", 2);

				// Verify JSON was properly stored
				Person.find({}, function (err, people) {
					should.equal(err, null);
					people[0].data.should.have.property("foo");
					people[1].data.should.have.property("baz");

					return done();
				});
			});
		});
	});

	describe("with empty array", function () {
		before(setup());

		it("should return empty result without error", function (done) {
			Person.createBatch([], function (err, results) {
				should.equal(err, null);
				should(Array.isArray(results));
				results.should.have.property("length", 0);

				return done();
			});
		});
	});

	describe("with non-array input", function () {
		before(setup());

		it("should return error", function (done) {
			Person.createBatch({ name: "John" }, function (err, results) {
				should.exist(err);
				err.message.should.match(/requires an array/);

				return done();
			});
		});
	});

	describe("with custom batch size", function () {
		before(setup());

		it("should respect custom batch size", function (done) {
			var data = [];
			for (var i = 0; i < 100; i++) {
				data.push({
					name: "Person " + i,
					age: 20 + (i % 50)
				});
			}

			Person.createBatch(data, { batchSize: 25 }, function (err, results) {
				should.equal(err, null);
				results.should.have.property("length", 100);

				// Verify all records were inserted
				Person.count({}, function (err, count) {
					should.equal(err, null);
					count.should.equal(100);

					return done();
				});
			});
		});
	});

	describe("Model.create() unchanged behavior", function () {
		before(setup());

		it("should still work with single object", function (done) {
			Person.create({
				name: "John Doe",
				age: 30
			}, function (err, person) {
				should.equal(err, null);
				person.should.have.property("name", "John Doe");
				person.should.be.an.instanceOf(Object);
				person.should.have.property("save");

				return done();
			});
		});

		it("should still work with array (sequential)", function (done) {
			Person.create([{
				name: "Jane Doe",
				age: 28
			}, {
				name: "Jack Doe",
				age: 25
			}], function (err, people) {
				should.equal(err, null);
				should(Array.isArray(people));
				people.should.have.property("length", 2);
				people[0].should.have.property("save");
				people[1].should.have.property("save");

				return done();
			});
		});
	});
});
