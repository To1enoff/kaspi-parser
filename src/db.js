import { MongoClient } from "mongodb";

let client;
let db;

export async function getDb() {
  if (db) return db;

  const uri = process.env.MONGO_URI;
  const name = process.env.DB_NAME;

  client = new MongoClient(uri, { maxPoolSize: 10 });
  await client.connect();
  db = client.db(name);

  return db;
}
