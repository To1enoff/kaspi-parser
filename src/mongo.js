import { MongoClient } from "mongodb";
import { CONFIG } from "./config.js";

let client;
let col;

export async function getProductsCollection() {
  if (col) return col;

  client = new MongoClient(CONFIG.MONGO_URI, { maxPoolSize: 20 });
  await client.connect();

  const db = client.db(CONFIG.MONGO_DB);
  col = db.collection(CONFIG.MONGO_COLLECTION);

  await col.createIndex({ id: 1, city: 1 }, { unique: true });
  await col.createIndex({ merchantName: 1 });
  await col.createIndex({ category_full_path: 1 });
  await col.createIndex({ parsedAt: -1 });

  return col;
}

export async function closeMongo() {
  if (client) await client.close();
  client = undefined;
  col = undefined;
}
