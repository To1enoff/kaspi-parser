import { MongoClient } from "mongodb";

let client;
let dbInstance;

export async function getDb() {
  if (dbInstance) return dbInstance;

  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
  const dbName = process.env.DB_NAME || "marketplace";

  client = new MongoClient(uri, { maxPoolSize: 20 });
  await client.connect();

  dbInstance = client.db(dbName);
  console.log("Connected to database:", dbName);

  return dbInstance;
}

export async function closeDb() {
  if (client) {
    await client.close();
    client = undefined;
    dbInstance = undefined;
  }
}