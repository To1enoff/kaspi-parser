import { getDb } from "./db.js";

export async function getCollections() {
  const db = await getDb();

  const products = db.collection(process.env.PRODUCTS_COLLECTION || "products");
  const watchlists = db.collection("watchlists");
  const snapshots = db.collection("product_snapshots");
  const alerts = db.collection("alerts");

  // индексы (можно безопасно вызывать каждый запуск)
  await watchlists.createIndex({ userId: 1, productId: 1 }, { unique: true });
  await watchlists.createIndex({ productId: 1 });

  await snapshots.createIndex({ productId: 1, ts: -1 });

await alerts.createIndex({ chatId: 1, productId: 1, type: 1 }, { unique: true });

  return { products, watchlists, snapshots, alerts };
}
