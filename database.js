var MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

var url = "mongodb://localhost:27017";
const dbName = 'mydb';

const insertDocuments = function(db, table, data, callback) {
  // Get the documents collection
  const collection = db.collection(table);
  // Insert some documents
//   collection.insertMany(data, function(err, result) {
//     assert.equal(err, null);
//     assert.equal(3, result.result.n);
//     assert.equal(3, result.ops.length);
//     //console.log("Inserted 3 documents into the collection");
//     callback(result);
//   });
    collection.insertMany(data, callback);
}

module.exports = function() {
    MongoClient.connect(url, { useNewUrlParser: true }, function(err, client) {
        assert.equal(null, err);
        console.log("MongoDB connected");
        client.close();
    });
    return {
        writeData: function(table, data) {
            MongoClient.connect(url, { useNewUrlParser: true }, function(err, client) {
                assert.equal(null, err);
                //console.log("Connected successfully to server");
        
                const db = client.db(dbName);
                
                insertDocuments(db, table, data, function() {
                    client.close();
                });
            });
        },
        readData: function(table, filter ,callback) {
            MongoClient.connect(url, { useNewUrlParser: true }, function(err, client) {
                const db = client.db(dbName);
                const collection = db.collection(table);
                collection.find(filter || {})
                .sort({ date: 1 })
                .toArray(function(err, docs) {
                    callback(docs);
                  });
            })            
        },
        deleteData: function(table, filter ,callback) {
          MongoClient.connect(url, { useNewUrlParser: true }, function(err, client) {
            const db = client.db(dbName);
            const collection = db.collection(table);
            collection.deleteMany(filter || {}, callback);
          })
        }
    }
};
