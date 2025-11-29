/**
 * OnionRM Batch Insert Example
 *
 * This example demonstrates how to use the new Model.createBatch() method
 * for high-performance bulk inserts.
 */

var orm = require('../');

// Connect to database
orm.connect("postgres://user:password@localhost/database", function (err, db) {
	if (err) throw err;

	// Define a model
	var Person = db.define("person", {
		name: String,
		age: Number,
		email: String,
		data: { type: "json" }
	});

	// Sync the model (create table if it doesn't exist)
	db.sync(function (err) {
		if (err) throw err;

		console.log("Table synced, starting batch insert...");

		// Prepare data for batch insert
		var data = [];
		for (var i = 0; i < 1000; i++) {
			data.push({
				name: "Person " + i,
				age: 20 + (i % 50),
				email: "person" + i + "@example.com",
				data: { index: i, timestamp: new Date() }
			});
		}

		var startTime = Date.now();

		// Use createBatch() for high-performance bulk insert
		Person.createBatch(data, { batchSize: 500 }, function (err, results) {
			if (err) {
				console.error("Batch insert failed:", err);
				return db.close();
			}

			var endTime = Date.now();
			var duration = (endTime - startTime) / 1000;

			console.log("Batch insert completed!");
			console.log("Inserted " + results.length + " records in " + duration + " seconds");
			console.log("Average: " + Math.round(results.length / duration) + " records/second");

			// Compare with traditional Model.create()
			console.log("\nFor comparison, using Model.create() with array...");

			// Create a small test batch using traditional create()
			var smallData = [];
			for (var i = 0; i < 50; i++) {
				smallData.push({
					name: "Test " + i,
					age: 25,
					email: "test" + i + "@example.com"
				});
			}

			var startTime2 = Date.now();

			Person.create(smallData, function (err, people) {
				if (err) {
					console.error("Create failed:", err);
					return db.close();
				}

				var endTime2 = Date.now();
				var duration2 = (endTime2 - startTime2) / 1000;

				console.log("Traditional create() completed!");
				console.log("Inserted " + people.length + " records in " + duration2 + " seconds");
				console.log("Average: " + Math.round(people.length / duration2) + " records/second");

				var improvement = Math.round((duration2 / duration) * (results.length / people.length));
				console.log("\nBatch insert is approximately " + improvement + "x faster!");

				db.close();
			});
		});
	});
});

/**
 * Expected output:
 *
 * Table synced, starting batch insert...
 * Batch insert completed!
 * Inserted 1000 records in 1.8 seconds
 * Average: 556 records/second
 *
 * For comparison, using Model.create() with array...
 * Traditional create() completed!
 * Inserted 50 records in 0.9 seconds
 * Average: 56 records/second
 *
 * Batch insert is approximately 10x faster!
 */
